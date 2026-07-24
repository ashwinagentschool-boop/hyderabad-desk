import type { Lead } from '../adapters/types';

/**
 * The fields the lead form actually edits. Provenance (`source`,
 * `redditPermalink`, `subreddit`) is set by whoever opened the form, not
 * typed by the agent, so it is deliberately not in here.
 */
export type LeadFormValues = Pick<Lead, 'name' | 'requirement' | 'status'> &
  Partial<Pick<Lead, 'phone' | 'budget' | 'area' | 'followUpDate' | 'notes'>>;

/** Drop empty strings so optional fields stay genuinely absent. */
export function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
