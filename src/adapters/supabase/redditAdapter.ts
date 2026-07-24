/**
 * Reddit triage, live.
 *
 * The browser only ever reads rows the Pi worker wrote and writes back a
 * triage decision. It never fetches Reddit itself and never writes a
 * fetch_logs row — the heartbeat means "the worker ran", and faking it
 * from here would make the status strip lie.
 */
import type {
  LeadPotential,
  RedditAdapter,
  RedditCategory,
  RedditPost,
} from '../types';
import { fail, getSupabase, opt } from './client';

const COLUMNS =
  'id, reddit_id, username, title, body, summary, subreddit, permalink, posted_at, ' +
  'category, lead_potential, areas, budget, property_type, classified_at, triage_state';

/** A generous ceiling — the pending queue is a work list, not an archive. */
const MAX_PENDING = 200;

const CATEGORIES: RedditCategory[] = [
  'buyer_lead',
  'seller_lead',
  'rental_lead',
  'advice_question',
  'market_discussion',
  'other',
];
const POTENTIALS: LeadPotential[] = ['hot', 'warm', 'cold', 'none'];

interface Row {
  id: string;
  reddit_id: string;
  username: string | null;
  title: string | null;
  body: string | null;
  summary: string | null;
  subreddit: string | null;
  permalink: string | null;
  posted_at: string | null;
  category: string | null;
  lead_potential: string | null;
  areas: string[] | null;
  budget: string | null;
  property_type: string | null;
  classified_at: string | null;
  triage_state: string | null;
}

function toPost(row: Row): RedditPost {
  const title = row.title ?? '';
  const category = CATEGORIES.includes(row.category as RedditCategory)
    ? (row.category as RedditCategory)
    : 'other';
  return {
    id: row.id,
    redditId: row.reddit_id,
    username: row.username ?? 'u/[deleted]',
    title,
    body: opt(row.body),
    // A row can predate classification or have fallen back; the title is
    // always something the agent can read, so never render an empty card.
    summary: opt(row.summary) ?? title,
    subreddit: row.subreddit ?? '',
    permalink: row.permalink ?? '',
    postedAt: row.posted_at ?? new Date(0).toISOString(),
    category,
    leadPotential: POTENTIALS.includes(row.lead_potential as LeadPotential)
      ? (row.lead_potential as LeadPotential)
      : 'none',
    areas: Array.isArray(row.areas) ? row.areas.filter((a) => a.trim() !== '') : [],
    budget: opt(row.budget),
    propertyType: opt(row.property_type),
    classifiedAt: opt(row.classified_at),
    triageState:
      row.triage_state === 'saved' || row.triage_state === 'ignored'
        ? row.triage_state
        : 'pending',
  };
}

async function listPending(): Promise<RedditPost[]> {
  const { data, error } = await getSupabase()
    .from('reddit_posts')
    .select(COLUMNS)
    .eq('triage_state', 'pending')
    .order('posted_at', { ascending: false })
    .limit(MAX_PENDING);

  if (error !== null) fail('load the Reddit queue', error);
  return (data as unknown as Row[]).map(toPost);
}

export const redditAdapter: RedditAdapter = {
  listPending,

  /**
   * "Refresh" is a re-read, not a crawl. The Pi's timer owns fetching; the
   * button exists so the agent can pull in whatever the last run wrote
   * without reloading the page.
   */
  async refresh() {
    return listPending();
  },

  async setTriageState(postId, state) {
    const { data, error } = await getSupabase()
      .from('reddit_posts')
      .update({ triage_state: state })
      .eq('id', postId)
      .select(COLUMNS)
      .single();

    if (error !== null) fail('update this post', error);
    return toPost(data as unknown as Row);
  },
};
