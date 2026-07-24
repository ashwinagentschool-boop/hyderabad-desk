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
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests
from dotenv import load_dotenv

from lib import db
from lib.classify import MODEL, classify_posts

# Reddit's WAF blocks library/script User-Agents on the public .json
# endpoint (the "blocked by network security" 403), even from residential
# IPs where a real browser loads the same URL fine. A browser UA gets a
# personal, low-volume dashboard through. This is the default path and
# needs no Reddit account.
BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# The durable path: Reddit's official OAuth API. Set REDDIT_CLIENT_ID and
# REDDIT_CLIENT_SECRET (a free "script" app at reddit.com/prefs/apps) and
# the worker authenticates every request against oauth.reddit.com, which
# the WAF never blocks and which grants a documented 100 req/min quota.
# Reddit asks the OAuth UA to be unique and descriptive.
OAUTH_UA = "script:hyderabad-desk:1.0 (personal real-estate lead dashboard)"

PUBLIC_BASE = "https://www.reddit.com"
OAUTH_BASE = "https://oauth.reddit.com"
TOKEN_URL = "https://www.reddit.com/api/v1/access_token"

PER_SUB_LIMIT = 50
REQUEST_SPACING_S = 1.0
BACKOFFS_S = (30, 60)
HTTP_TIMEOUT_S = 20

log = logging.getLogger("fetch_reddit")


# ------------------------------------------------------------------ #
# Reddit
# ------------------------------------------------------------------ #


def _oauth_token(client_id: str, client_secret: str) -> str:
    """
    Application-only OAuth token for a script app (client_credentials). Reads
    public listings only; no Reddit account password is ever needed or stored.
    """
    resp = requests.post(
        TOKEN_URL,
        auth=(client_id, client_secret),
        data={"grant_type": "client_credentials"},
        headers={"User-Agent": OAUTH_UA},
        timeout=HTTP_TIMEOUT_S,
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("Reddit returned no access_token")
    return token


def build_reddit_session() -> tuple[requests.Session, str]:
    """
    A ready-to-use session and the base URL to hit.

    Prefers OAuth when REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are set; a
    bad or unreachable credential falls back to the public endpoint with a
    browser UA rather than killing the whole run.
    """
    session = requests.Session()
    session.headers.update(
        {"Accept": "application/json", "Accept-Language": "en-US,en;q=0.9"}
    )

    client_id = os.environ.get("REDDIT_CLIENT_ID", "").strip()
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "").strip()
    have_creds = (
        client_id and client_secret and "PASTE_HERE" not in (client_id, client_secret)
    )

    if have_creds:
        try:
            token = _oauth_token(client_id, client_secret)
            session.headers.update(
                {"Authorization": f"Bearer {token}", "User-Agent": OAUTH_UA}
            )
            log.info("using Reddit OAuth (oauth.reddit.com)")
            return session, OAUTH_BASE
        except Exception as exc:  # noqa: BLE001 — degrade to public, don't abort
            log.warning("Reddit OAuth failed (%s); falling back to public endpoint", exc)

    session.headers.update({"User-Agent": BROWSER_UA})
    return session, PUBLIC_BASE


def fetch_subreddit(
    session: requests.Session, base: str, sub: str, limit: int
) -> list[dict[str, Any]]:
    """
    One subreddit's newest posts.

    On 429 we back off 30s then 60s, then give up on this subreddit and let
    the run continue — one rate-limited sub must not cost us the others.
    Raises on a non-429 HTTP failure so the caller can record it per-sub.
    """
    # oauth.reddit.com serves JSON without the .json suffix; the public host
    # needs it. Everything downstream sees the same payload shape.
    suffix = "" if base == OAUTH_BASE else ".json"
    url = f"{base}/r/{sub}/new{suffix}"
    params = {"limit": str(limit), "raw_json": "1"}

    for attempt in range(len(BACKOFFS_S) + 1):
        response = session.get(url, params=params, timeout=HTTP_TIMEOUT_S)

        if response.status_code == 429:
            if attempt < len(BACKOFFS_S):
                wait = BACKOFFS_S[attempt]
                log.warning("r/%s rate limited (429); backing off %ss", sub, wait)
                time.sleep(wait)
                continue
            log.error("r/%s still rate limited after backoff; skipping", sub)
            return []

        response.raise_for_status()
        payload = response.json()
        children = payload.get("data", {}).get("children", [])
        return [child.get("data", {}) for child in children if isinstance(child, dict)]

    return []


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
    session, base = build_reddit_session()

    posts: list[dict[str, Any]] = []
    failures: list[str] = []

    for index, sub in enumerate(subs):
        if index > 0:
            time.sleep(REQUEST_SPACING_S)
        try:
            raw_posts = fetch_subreddit(session, base, sub, per_sub_limit)
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
    return parser.parse_args(argv)


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
