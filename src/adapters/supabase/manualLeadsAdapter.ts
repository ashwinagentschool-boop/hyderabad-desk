/**
 * The lead pipeline, live. Owns the WHOLE pipeline, not just manual
 * entries — the Reddit tab promotes a post through `create` with
 * source: 'reddit', exactly as it did against the mock.
 */
import type { Lead, LeadStatus, ManualLeadsAdapter } from '../types';
import { fail, getSupabase, opt } from './client';

const COLUMNS =
  'id, source, name, phone, requirement, budget, area, status, follow_up_date, ' +
  'notes, reddit_permalink, subreddit, created_at, updated_at';

interface Row {
  id: string;
  source: string;
  name: string;
  phone: string | null;
  requirement: string;
  budget: string | null;
  area: string | null;
  status: string;
  follow_up_date: string | null;
  notes: string | null;
  reddit_permalink: string | null;
  subreddit: string | null;
  created_at: string;
  updated_at: string;
}

const STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'site_visit',
  'negotiation',
  'closed',
  'lost',
];

function toLead(row: Row): Lead {
  return {
    id: row.id,
    source: row.source === 'reddit' ? 'reddit' : 'manual',
    name: row.name,
    phone: opt(row.phone),
    requirement: row.requirement,
    budget: opt(row.budget),
    area: opt(row.area),
    status: STATUSES.includes(row.status as LeadStatus) ? (row.status as LeadStatus) : 'new',
    // A bare YYYY-MM-DD. The UI string-compares it against local today, so
    // it must never become a timestamp on the way through.
    followUpDate: opt(row.follow_up_date)?.slice(0, 10),
    notes: opt(row.notes),
    redditPermalink: opt(row.reddit_permalink),
    subreddit: opt(row.subreddit),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Undefined means "leave it out"; empty string means "clear the column". */
function toColumn(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

type Patch = Partial<Omit<Lead, 'id' | 'createdAt'>>;

function toRow(patch: Patch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (column: string, value: string | null | undefined) => {
    if (value !== undefined) row[column] = value;
  };

  set('source', patch.source);
  set('name', patch.name);
  set('phone', toColumn(patch.phone));
  set('requirement', patch.requirement);
  set('budget', toColumn(patch.budget));
  set('area', toColumn(patch.area));
  set('status', patch.status);
  set('follow_up_date', toColumn(patch.followUpDate));
  set('notes', toColumn(patch.notes));
  set('reddit_permalink', toColumn(patch.redditPermalink));
  set('subreddit', toColumn(patch.subreddit));
  return row;
}

export const manualLeadsAdapter: ManualLeadsAdapter = {
  async list() {
    const { data, error } = await getSupabase()
      .from('leads')
      .select(COLUMNS)
      .order('updated_at', { ascending: false });

    if (error !== null) fail('load your leads', error);
    return (data as unknown as Row[]).map(toLead);
  },

  async create(input) {
    const { data, error } = await getSupabase()
      .from('leads')
      .insert(toRow(input))
      .select(COLUMNS)
      .single();

    if (error !== null) fail('save this lead', error);
    return toLead(data as unknown as Row);
  },

  async update(leadId, patch) {
    // updated_at is bumped by a database trigger, not by the client — the
    // pipeline sorts on it and a browser clock is not to be trusted.
    const { data, error } = await getSupabase()
      .from('leads')
      .update(toRow(patch))
      .eq('id', leadId)
      .select(COLUMNS)
      .single();

    if (error !== null) fail('update this lead', error);
    return toLead(data as unknown as Row);
  },

  async delete(leadId) {
    const { error } = await getSupabase().from('leads').delete().eq('id', leadId);
    if (error !== null) fail('delete this lead', error);
  },
};
