"""
Supabase access for the worker, using the service_role key.

service_role bypasses RLS by design — this process is the only writer of
source data (reddit_posts, fetch_logs). It must never run in a browser.

Every function here takes an explicit client so the entrypoint owns the
connection and `--dry-run` can skip creating one entirely.
"""

from __future__ import annotations

import os
from typing import Any, Iterable, Sequence

from supabase import Client, create_client

# Postgres `in` filters go on the URL, so a 500-id list would blow past
# proxy URL limits. 200 ids is ~2.5 KB, comfortably safe.
_ID_CHUNK = 200

# Used only by `--dry-run` when there are no credentials yet, so the smoke
# test works before the Supabase project exists. A real run always reads
# the live `settings` row instead.
DEFAULT_SUBREDDITS = ["hyderabadrealestate", "hyderabad", "IndiaInvestments"]


class ConfigError(RuntimeError):
    """A required environment variable is missing or empty."""


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value or value == "PASTE_HERE":
        raise ConfigError(
            f"{name} is not set. Copy worker/.env.example to worker/.env and fill it in."
        )
    return value


def get_client() -> Client:
    """Service-role client. Raises ConfigError if the env is not filled in."""
    return create_client(
        require_env("SUPABASE_URL"),
        require_env("SUPABASE_SERVICE_ROLE_KEY"),
    )


# ------------------------------------------------------------------ #
# settings
# ------------------------------------------------------------------ #


def load_subreddits(sb: Client) -> list[str]:
    """
    The subreddit list is read from the database on EVERY run, never from
    a local file. The agent edits it in the app; the Pi obeys it next run
    with no redeploy and no SSH.
    """
    res = sb.table("settings").select("value").eq("key", "subreddits").execute()
    rows = res.data or []
    if not rows:
        return []
    value = rows[0].get("value")
    if not isinstance(value, list):
        return []
    # Tolerate the "r/" prefix even though the UI strips it — a hand-edited
    # row should not silently produce 404s.
    return [
        s.strip().lstrip("/").removeprefix("r/").strip()
        for s in value
        if isinstance(s, str) and s.strip()
    ]


# ------------------------------------------------------------------ #
# reddit_posts
# ------------------------------------------------------------------ #


def existing_reddit_ids(sb: Client, reddit_ids: Sequence[str]) -> set[str]:
    """
    Which of these ids are already stored. This runs BEFORE classification
    so each post is sent to the LLM exactly once, ever.
    """
    found: set[str] = set()
    for i in range(0, len(reddit_ids), _ID_CHUNK):
        chunk = list(reddit_ids[i : i + _ID_CHUNK])
        if not chunk:
            continue
        res = (
            sb.table("reddit_posts")
            .select("reddit_id")
            .in_("reddit_id", chunk)
            .execute()
        )
        found.update(row["reddit_id"] for row in (res.data or []))
    return found


def insert_posts(sb: Client, rows: list[dict[str, Any]]) -> int:
    """
    Plain insert — every row is new by construction (deduped above).

    Deliberately NOT an upsert: an upsert could overwrite `triage_state` on
    a post the agent already saved or ignored. `reddit_id` is unique, so a
    genuine race surfaces as an error rather than silent data loss.
    """
    if not rows:
        return 0
    res = sb.table("reddit_posts").insert(rows).execute()
    return len(res.data or [])


def prune_old_posts(sb: Client, ignored_days: int = 30, pending_days: int = 60) -> int:
    """
    Retention. Saved posts are never auto-deleted: the agent kept them on
    purpose, and a lead may still point back at one.
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    deleted = 0
    for state, days in (("ignored", ignored_days), ("pending", pending_days)):
        cutoff = (now - timedelta(days=days)).isoformat()
        res = (
            sb.table("reddit_posts")
            .delete()
            .eq("triage_state", state)
            .lt("posted_at", cutoff)
            .execute()
        )
        deleted += len(res.data or [])
    return deleted


# ------------------------------------------------------------------ #
# fetch_logs
# ------------------------------------------------------------------ #


def log_run(
    sb: Client,
    *,
    source: str,
    status: str,
    items_fetched: int,
    items_classified: int,
    message: str,
) -> None:
    """
    Exactly one row per run. The header strip in the app reads the newest
    row per source, so this is the only signal that the Pi is alive.
    """
    sb.table("fetch_logs").insert(
        {
            "source": source,
            "status": status,
            "items_fetched": items_fetched,
            "items_classified": items_classified,
            # Keep it short: the UI renders it inline on a phone.
            "message": message[:300],
        }
    ).execute()


def chunked(items: Sequence[Any], size: int) -> Iterable[list[Any]]:
    for i in range(0, len(items), size):
        yield list(items[i : i + size])
