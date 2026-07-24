#!/usr/bin/env python3
"""
Hyderabad Desk — Reddit fetch worker.

Single entrypoint, run by a systemd timer every two hours on a Raspberry Pi.

  1. Read the watched subreddit list from the `settings` table (not a local
     file — the agent edits it in the app and the Pi obeys on the next run).
  2. Fetch /new.json for each subreddit, politely.
  3. Dedupe against reddit_posts BEFORE classification, so each post costs
     exactly one LLM call in its lifetime.
  4. Classify the genuinely-new posts with Claude.
  5. Insert. Never touch triage_state on an existing row.
  6. Prune old ignored/pending posts.
  7. Write exactly one fetch_logs row, whatever happened.

Flags
  --dry-run        print what would happen; no writes, no LLM calls
  --limit N        cap the posts processed this run (testing)
  --only-sub SUB   fetch a single subreddit instead of the settings list
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests
from dotenv import load_dotenv

from lib import db
from lib.classify import MODEL, classify_posts

# Every request carries this UA. Reddit's public .json endpoint 403s the
# default python-requests / curl / PowerShell User-Agents; a descriptive
# custom UA is what their API guidelines ask for and is what gets a browser
# through. It is set once on the shared session so no call can forget it.
USER_AGENT = "hyderabad-desk/1.0 (personal dashboard; contact: none)"

PRIMARY_HOST = "https://www.reddit.com"
# Same JSON, different host. Sometimes answers when the primary 403s, so it
# is the single fallback for a 403 (not an IP change, but cheap to try).
FALLBACK_HOST = "https://old.reddit.com"

PER_SUB_LIMIT = 50
# Sequential fetches, minimum this gap between them. One run every two hours
# never needs to go faster, and it keeps us well under Reddit's limits.
REQUEST_SPACING_S = 1.5
NETWORK_RETRY_SLEEP_S = 2
BACKOFFS_S = (30, 60)
HTTP_TIMEOUT_S = 10

log = logging.getLogger("fetch_reddit")


# ------------------------------------------------------------------ #
# Reddit — public JSON only, no credentials
# ------------------------------------------------------------------ #


class FetchError(Exception):
    """
    A terminal per-subreddit fetch failure. The caller records it against
    that subreddit and moves on; one bad sub never crashes the run.
    """


def build_session() -> requests.Session:
    """
    The ONE session every Reddit request goes through. The custom UA lives
    here so a request cannot be made without it.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    return session


def _retry_after(response: requests.Response) -> int | None:
    """Reddit's Retry-After, when it sends a plain-seconds value."""
    value = (response.headers.get("Retry-After") or "").strip()
    return int(value) if value.isdigit() else None


def _get(session: requests.Session, host: str, sub: str, params: dict[str, str]):
    """
    A single GET with one network/timeout retry. Raises FetchError if the
    connection itself fails twice; an HTTP error status is returned as-is
    for the caller's status ladder.
    """
    url = f"{host}/r/{sub}/new.json"
    for attempt in (1, 2):
        try:
            return session.get(url, params=params, timeout=HTTP_TIMEOUT_S)
        except requests.RequestException as exc:
            if attempt == 2:
                raise FetchError(f"network error: {exc}") from exc
            log.warning("r/%s network error (%s); one retry", sub, exc)
            time.sleep(NETWORK_RETRY_SLEEP_S)
    raise FetchError("unreachable")  # for the type checker; loop always returns/raises


def _parse_children(response: requests.Response, sub: str) -> list[dict[str, Any]]:
    """
    Pull the post dicts out of a 200 body. Reddit occasionally answers 200
    with an HTML block page instead of JSON, so a parse failure logs the
    first 200 chars and is treated as a fetch failure, not a crash.
    """
    try:
        payload = response.json()
    except ValueError as exc:
        snippet = response.text[:200].replace("\n", " ")
        raise FetchError(f"non-JSON body (first 200 chars): {snippet}") from exc
    children = payload.get("data", {}).get("children", [])
    return [child.get("data", {}) for child in children if isinstance(child, dict)]


def fetch_subreddit(
    session: requests.Session, sub: str, limit: int
) -> list[dict[str, Any]]:
    """
    One subreddit's newest posts, following the status ladder:

      200 -> parse and return.
      429 -> honour Retry-After, else back off 30s then 60s; after two
             retries give up on this sub (FetchError).
      403 -> do NOT retry (it is an IP/policy block, not transient); try the
             SAME path once on old.reddit.com. If that also fails, FetchError.
      other / network / bad JSON -> FetchError.

    Raising FetchError lets the caller log the failure and carry on.
    """
    params = {"limit": str(limit), "raw_json": "1"}

    # --- primary host, with 429 backoff ---------------------------------
    for attempt in range(len(BACKOFFS_S) + 1):
        response = _get(session, PRIMARY_HOST, sub, params)
        code = response.status_code

        if code == 200:
            return _parse_children(response, sub)

        if code == 429:
            if attempt < len(BACKOFFS_S):
                wait = _retry_after(response) or BACKOFFS_S[attempt]
                log.warning("r/%s rate limited (429); backing off %ss", sub, wait)
                time.sleep(wait)
                continue
            raise FetchError("rate limited (429) after 2 retries")

        if code == 403:
            break  # to the single old.reddit.com fallback below

        raise FetchError(f"HTTP {code}")

    # --- 403 fallback: old.reddit.com, one shot -------------------------
    log.warning("r/%s got 403 on www.reddit.com; trying old.reddit.com", sub)
    response = _get(session, FALLBACK_HOST, sub, params)
    if response.status_code == 200:
        return _parse_children(response, sub)
    raise FetchError(
        f"403 on www.reddit.com; old.reddit.com returned {response.status_code}"
    )


def to_post(raw: dict[str, Any], sub: str) -> dict[str, Any] | None:
    """Map Reddit's JSON onto our row shape. Skips anything without an id."""
    reddit_id = raw.get("name") or (f"t3_{raw['id']}" if raw.get("id") else None)
    if not reddit_id:
        return None

    created = raw.get("created_utc")
    posted_at = (
        datetime.fromtimestamp(float(created), tz=timezone.utc).isoformat()
        if isinstance(created, (int, float))
        else None
    )

    author = (raw.get("author") or "").strip()
    permalink = raw.get("permalink") or ""

    return {
        "reddit_id": reddit_id,
        # Stored with the u/ prefix because that is how the agent reads it.
        "username": f"u/{author}" if author and author != "[deleted]" else "u/[deleted]",
        "title": (raw.get("title") or "").strip(),
        # Link posts have no selftext; the title carries the whole thing.
        "body": (raw.get("selftext") or "").strip() or None,
        # Bare name, matching how the settings row stores it. The UI adds "r/".
        "subreddit": (raw.get("subreddit") or sub).strip(),
        "permalink": f"https://www.reddit.com{permalink}" if permalink else None,
        "posted_at": posted_at,
    }


def collect(subs: list[str], per_sub_limit: int) -> tuple[list[dict[str, Any]], list[str]]:
    """Fetch every subreddit in turn. Returns (posts, per-subreddit failures)."""
    # One shared session so the custom User-Agent is on every request.
    session = build_session()

    posts: list[dict[str, Any]] = []
    failures: list[str] = []

    for index, sub in enumerate(subs):
        if index > 0:
            time.sleep(REQUEST_SPACING_S)
        try:
            raw_posts = fetch_subreddit(session, sub, per_sub_limit)
        except Exception as exc:  # noqa: BLE001 — one bad sub must not end the run
            log.error("r/%s fetch failed: %s", sub, exc)
            failures.append(sub)
            continue

        mapped = [p for p in (to_post(raw, sub) for raw in raw_posts) if p is not None]
        log.info("r/%s: %d posts", sub, len(mapped))
        posts.extend(mapped)

    # The same crosspost can appear in two watched subs within one run.
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for post in posts:
        if post["reddit_id"] in seen:
            continue
        seen.add(post["reddit_id"])
        unique.append(post)

    return unique, failures


# ------------------------------------------------------------------ #
# Run
# ------------------------------------------------------------------ #


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch and classify Reddit posts.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print what would happen; no database writes and no LLM calls",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="cap the number of posts processed this run (testing)",
    )
    parser.add_argument(
        "--only-sub",
        default=None,
        metavar="SUB",
        help="fetch a single subreddit instead of the settings list",
    )
    parser.add_argument(
        "--test-fetch",
        action="store_true",
        help="connectivity smoke test: hit one subreddit, print the HTTP "
        "status, post count and first title. No database, no LLM.",
    )
    return parser.parse_args(argv)


def test_fetch(sub: str) -> int:
    """
    Standalone connectivity check for a new machine. Uses the exact shared
    session and User-Agent the real run uses, so a pass here means the real
    fetch works. Prints status, count and first title; returns an exit code.
    """
    session = build_session()
    log.info("GET https://www.reddit.com/r/%s/new.json  (UA: %s)", sub, USER_AGENT)
    try:
        raw = fetch_subreddit(session, sub, 5)
    except FetchError as exc:
        # fetch_subreddit already tried old.reddit.com on a 403; surface why.
        log.error("FAIL: %s", exc)
        log.error(
            "The custom User-Agent is set but the request was still refused. "
            "This is an IP-level or TLS-fingerprint block, not a UA problem."
        )
        return 1

    print(f"HTTP 200 OK — {len(raw)} post(s)")
    if raw:
        first = to_post(raw[0], sub)
        title = (first or {}).get("title") or raw[0].get("title") or "(no title)"
        print(f"first post: {title[:100]}")
    print("Connectivity OK — the scheduled run will fetch fine on this machine.")
    return 0


def resolve_subreddits(args: argparse.Namespace, sb: Any) -> list[str]:
    if args.only_sub:
        return [args.only_sub.strip().lstrip("/").removeprefix("r/")]
    if sb is None:
        log.warning(
            "no credentials; --dry-run falling back to the built-in subreddit list"
        )
        return db.DEFAULT_SUBREDDITS
    subs = db.load_subreddits(sb)
    if not subs:
        log.warning("settings.subreddits is empty; nothing to fetch")
    return subs


def run(args: argparse.Namespace) -> int:
    """Returns a process exit code. Always writes one fetch_logs row (unless dry)."""
    # Connectivity smoke test: no DB, no LLM, one subreddit. Runs before any
    # credential check so it works on a brand-new machine.
    if args.test_fetch:
        sub = (
            args.only_sub.strip().lstrip("/").removeprefix("r/")
            if args.only_sub
            else db.DEFAULT_SUBREDDITS[0]
        )
        return test_fetch(sub)

    sb = None
    anthropic_key = ""

    # In a dry run, missing credentials are a warning rather than a failure —
    # that is the whole point of the smoke test before .env is filled in.
    try:
        sb = db.get_client()
    except db.ConfigError as exc:
        if not args.dry_run:
            log.error("%s", exc)
            return 1
        log.warning("%s", exc)

    if not args.dry_run:
        try:
            anthropic_key = db.require_env("ANTHROPIC_API_KEY")
        except db.ConfigError as exc:
            log.error("%s", exc)
            return 1

    status = "ok"
    fetched = 0
    classified = 0
    inserted = 0
    pruned = 0
    fell_back = 0
    notes: list[str] = []
    exit_code = 0

    try:
        subs = resolve_subreddits(args, sb)
        per_sub_limit = min(PER_SUB_LIMIT, args.limit) if args.limit else PER_SUB_LIMIT

        posts, failures = collect(subs, per_sub_limit)
        fetched = len(posts)
        if failures:
            notes.append(f"{len(failures)} subreddit(s) failed: {', '.join(failures)}")
        # A partial failure (some subs worked) is a normal, healthy run. But
        # if EVERY subreddit failed we reached nothing — reporting "ok" would
        # turn the health dot green and claim "synced just now" when the
        # worker is effectively down. Mark it an error so the strip goes red.
        if subs and len(failures) == len(subs):
            status = "error"

        # --- dedupe BEFORE classification: one LLM call per post, ever ----
        if sb is not None:
            known = db.existing_reddit_ids(sb, [p["reddit_id"] for p in posts])
        else:
            known = set()
        new_posts = [p for p in posts if p["reddit_id"] not in known]

        if args.limit is not None and len(new_posts) > args.limit:
            new_posts = new_posts[: args.limit]
            notes.append(f"capped at --limit {args.limit}")

        log.info(
            "%d fetched across %d subreddit(s), %d already stored, %d new",
            fetched,
            len(subs),
            fetched - len(new_posts) if sb is not None else 0,
            len(new_posts),
        )

        if args.dry_run:
            for post in new_posts:
                log.info(
                    "  would classify+insert %s  r/%s  %s",
                    post["reddit_id"],
                    post["subreddit"],
                    (post["title"] or "")[:80],
                )
            log.info(
                "dry run: no rows written, no LLM calls, %d post(s) would be inserted",
                len(new_posts),
            )
            return 0

        # --- classify -----------------------------------------------------
        if new_posts:
            log.info("classifying %d new post(s) with %s", len(new_posts), MODEL)
            results, fell_back = classify_posts(new_posts, api_key=anthropic_key)
            now = datetime.now(timezone.utc).isoformat()
            for post in new_posts:
                classification = results[post["reddit_id"]]
                post.update(classification.as_row())
                post["classified_at"] = now
            classified = len(new_posts) - fell_back
            if fell_back:
                notes.append(f"{fell_back} post(s) stored unclassified")

        # --- insert (plain insert; triage_state left at its default) -------
        inserted = db.insert_posts(sb, new_posts)
        log.info("inserted %d row(s)", inserted)

        # --- retention -----------------------------------------------------
        pruned = db.prune_old_posts(sb)
        if pruned:
            log.info("pruned %d old post(s)", pruned)

    except Exception as exc:  # noqa: BLE001 — the run must always be logged
        status = "error"
        notes.append(f"{type(exc).__name__}: {exc}")
        exit_code = 1
        log.exception("run failed")

    if args.dry_run:
        return exit_code

    summary = (
        f"{fetched} seen, {inserted} new, {classified} classified"
        + (f" ({'; '.join(notes)})" if notes else "")
    )
    try:
        db.log_run(
            sb,
            source="reddit",
            status=status,
            items_fetched=fetched,
            items_classified=classified,
            message=summary,
        )
        log.info("logged run: %s — %s", status, summary)
    except Exception as exc:  # noqa: BLE001
        # The heartbeat failing is bad but must not mask the real outcome.
        log.error("could not write fetch_logs row: %s", exc)
        exit_code = exit_code or 1

    return exit_code


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        # systemd/journald adds its own timestamp, so keep this lean.
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    # Load worker/.env regardless of the working directory the timer uses.
    from pathlib import Path

    load_dotenv(Path(__file__).resolve().parent / ".env")
    return run(parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
