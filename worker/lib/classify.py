"""
Claude classification for Reddit posts.

Every new post goes through here exactly once, at insert time. The result
is stored on the row, so the frontend never calls an LLM and a re-crawl
never re-pays for a post already seen.

Model: Haiku 4.5 — the cheapest current model, and this is a short
structured-extraction task with a fixed rubric, not a reasoning problem.
temperature=0 so the same post classifies the same way twice.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, asdict
from typing import Any, Iterable, Sequence

import anthropic

log = logging.getLogger("classify")

MODEL = "claude-haiku-4-5"
BATCH_SIZE = 10
BODY_LIMIT = 1500
MAX_TOKENS = 4096

CATEGORIES = {
    "buyer_lead",
    "seller_lead",
    "rental_lead",
    "advice_question",
    "market_discussion",
    "other",
}
LEAD_POTENTIALS = {"hot", "warm", "cold", "none"}
PROPERTY_TYPES = {"apartment", "villa", "plot", "commercial", "land", "other"}

SYSTEM_PROMPT = (
    "You classify Reddit posts for a real-estate agent in Hyderabad, India. "
    "For each post return: category — buyer_lead (author wants to buy property), "
    "seller_lead (author wants to sell), rental_lead (author seeks or offers a rental), "
    "advice_question (asks about loans, legal, RERA, taxes, or market advice), "
    "market_discussion (news, prices, trends, general talk), other (unrelated). "
    "summary — one neutral sentence, max 25 words, stating what the author wants; "
    "write for a busy agent scanning a feed. "
    "lead_potential — hot: explicit buy/sell/rent intent PLUS at least two specifics "
    "(budget, locality, timeline, property type); warm: clear intent but few specifics; "
    "cold: vague future interest; none: not a potential client (includes all "
    "market_discussion/other). areas — Hyderabad localities mentioned, as an array with "
    "normalized spelling (Gachibowli, Kondapur, Kokapet, ...); empty if none. "
    "budget — verbatim as written ('90L', '1.2Cr', '25k/month') or null. "
    "property_type — apartment | villa | plot | commercial | land | other | null. "
    "Respond with ONLY the JSON array, no prose."
)


@dataclass
class Classification:
    category: str
    summary: str
    lead_potential: str
    areas: list[str]
    budget: str | None
    property_type: str | None

    def as_row(self) -> dict[str, Any]:
        return asdict(self)


def fallback(title: str) -> Classification:
    """
    What a post gets when the LLM could not classify it. Never drop a post
    over a model failure — an unclassified lead in the queue is recoverable,
    a silently discarded one is not.
    """
    return Classification(
        category="other",
        summary=(title or "").strip()[:300] or "No summary available.",
        lead_potential="none",
        areas=[],
        budget=None,
        property_type=None,
    )


# ------------------------------------------------------------------ #
# Defensive parsing
# ------------------------------------------------------------------ #

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def _strip_fences(text: str) -> str:
    """Models wrap JSON in ``` fences often enough to handle it up front."""
    cleaned = _FENCE.sub("", text.strip())
    # If there is still prose around the array, take the outermost [...] span.
    start, end = cleaned.find("["), cleaned.rfind("]")
    if start != -1 and end > start:
        return cleaned[start : end + 1]
    return cleaned


def _clean_str(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed or trimmed.lower() in {"null", "none", "n/a"}:
        return None
    return trimmed[:limit]


def _coerce(item: Any, title_by_id: dict[str, str]) -> tuple[str, Classification] | None:
    """
    Validate one object from the model's array. Every enum is checked; an
    out-of-vocabulary value degrades to the safe default rather than being
    written to a column with a CHECK constraint that would reject the whole
    insert batch.
    """
    if not isinstance(item, dict):
        return None
    reddit_id = _clean_str(item.get("reddit_id"), 64)
    if reddit_id is None or reddit_id not in title_by_id:
        return None

    category = item.get("category")
    if category not in CATEGORIES:
        category = "other"

    potential = item.get("lead_potential")
    if potential not in LEAD_POTENTIALS:
        potential = "none"
    # A post that is not about a person's own transaction is never a lead,
    # whatever the model says about potential.
    if category in {"market_discussion", "other"}:
        potential = "none"

    property_type = _clean_str(item.get("property_type"), 32)
    if property_type is not None:
        property_type = property_type.lower()
        if property_type not in PROPERTY_TYPES:
            property_type = "other"

    raw_areas = item.get("areas")
    areas: list[str] = []
    if isinstance(raw_areas, list):
        for area in raw_areas:
            cleaned = _clean_str(area, 64)
            if cleaned is not None and cleaned not in areas:
                areas.append(cleaned)

    summary = _clean_str(item.get("summary"), 300)
    if summary is None:
        summary = title_by_id[reddit_id][:300] or "No summary available."

    return reddit_id, Classification(
        category=category,
        summary=summary,
        lead_potential=potential,
        areas=areas,
        budget=_clean_str(item.get("budget"), 64),
        property_type=property_type,
    )


def _parse_array(text: str, title_by_id: dict[str, str]) -> dict[str, Classification]:
    payload = json.loads(_strip_fences(text))
    if not isinstance(payload, list):
        raise ValueError("expected a JSON array")
    out: dict[str, Classification] = {}
    for item in payload:
        coerced = _coerce(item, title_by_id)
        if coerced is not None:
            out[coerced[0]] = coerced[1]
    return out


# ------------------------------------------------------------------ #
# API
# ------------------------------------------------------------------ #


def _user_content(batch: Sequence[dict[str, Any]]) -> str:
    posts = [
        {
            "reddit_id": p["reddit_id"],
            "title": (p.get("title") or "")[:300],
            "body": (p.get("body") or "")[:BODY_LIMIT],
        }
        for p in batch
    ]
    return (
        f"Classify these {len(posts)} Reddit posts. Return a JSON array with one "
        f"object per post, in the same order, each including its reddit_id.\n\n"
        + json.dumps(posts, ensure_ascii=False, indent=2)
    )


def _classify_batch(
    client: anthropic.Anthropic,
    batch: Sequence[dict[str, Any]],
    model: str,
) -> dict[str, Classification]:
    title_by_id = {p["reddit_id"]: (p.get("title") or "") for p in batch}
    response = client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        temperature=0,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _user_content(batch)}],
    )
    text = "".join(
        block.text for block in response.content if getattr(block, "type", "") == "text"
    )
    return _parse_array(text, title_by_id)


def classify_posts(
    posts: Sequence[dict[str, Any]],
    *,
    api_key: str,
    model: str = MODEL,
    batch_size: int = BATCH_SIZE,
) -> tuple[dict[str, Classification], int]:
    """
    Classify new posts. Returns (results keyed by reddit_id, count of posts
    that fell back).

    Every post in `posts` is present in the result — a post that fails
    classification after one retry gets `fallback()` rather than being
    dropped. Each batch is retried at most once.
    """
    if not posts:
        return {}, 0

    client = anthropic.Anthropic(api_key=api_key)
    results: dict[str, Classification] = {}
    fell_back = 0

    for start in range(0, len(posts), batch_size):
        batch = list(posts[start : start + batch_size])
        parsed: dict[str, Classification] = {}

        for attempt in (1, 2):
            try:
                parsed = _classify_batch(client, batch, model)
                if parsed:
                    break
                log.warning(
                    "classification batch %d returned no usable items (attempt %d)",
                    start // batch_size + 1,
                    attempt,
                )
            except Exception as exc:  # noqa: BLE001 — never let one batch kill the run
                log.warning(
                    "classification batch %d failed (attempt %d): %s",
                    start // batch_size + 1,
                    attempt,
                    exc,
                )
            if attempt == 2:
                parsed = {}

        for post in batch:
            reddit_id = post["reddit_id"]
            if reddit_id in parsed:
                results[reddit_id] = parsed[reddit_id]
            else:
                results[reddit_id] = fallback(post.get("title") or "")
                fell_back += 1

    return results, fell_back


def iter_batches(items: Sequence[Any], size: int) -> Iterable[list[Any]]:
    for i in range(0, len(items), size):
        yield list(items[i : i + size])
