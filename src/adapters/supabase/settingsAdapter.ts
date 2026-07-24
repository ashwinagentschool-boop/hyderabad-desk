/**
 * Settings, live. This table is a shared contract, not just app state:
 * the browser writes `subreddits` and the Pi worker reads the same row on
 * its next run. Nothing has to be redeployed and nobody has to SSH in.
 *
 * Storage is key/value jsonb, so a new setting is a row rather than a
 * migration.
 */
import type { Settings, SettingsAdapter } from '../types';
import { fail, getSupabase } from './client';

/** Frontend field <-> settings.key. Snake case on the wire, as elsewhere. */
const KEYS: Record<keyof Settings, string> = {
  subreddits: 'subreddits',
  keywords: 'keywords',
  twitterHandles: 'twitter_handles',
  instaAccounts: 'insta_accounts',
};

/**
 * Used when a row is missing entirely. schema.sql seeds all four, but a
 * hand-deleted row must not leave the app configuration-less.
 */
const DEFAULTS: Settings = {
  subreddits: ['hyderabadrealestate', 'hyderabad', 'IndiaInvestments'],
  keywords: [],
  twitterHandles: [],
  instaAccounts: [],
};

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

export const settingsAdapter: SettingsAdapter = {
  async get() {
    const { data, error } = await getSupabase().from('settings').select('key, value');
    if (error !== null) fail('load your settings', error);

    const byKey = new Map(
      (data as { key: string; value: unknown }[]).map((row) => [row.key, row.value]),
    );

    return {
      subreddits: toStringArray(byKey.get(KEYS.subreddits), DEFAULTS.subreddits),
      keywords: toStringArray(byKey.get(KEYS.keywords), DEFAULTS.keywords),
      twitterHandles: toStringArray(byKey.get(KEYS.twitterHandles), DEFAULTS.twitterHandles),
      instaAccounts: toStringArray(byKey.get(KEYS.instaAccounts), DEFAULTS.instaAccounts),
    };
  },

  async update(patch) {
    // Patch semantics: only the keys the caller sent are written. The UI
    // sends one at a time, so an upsert of just those rows is exact.
    const rows = (Object.keys(patch) as (keyof Settings)[])
      .filter((field) => patch[field] !== undefined)
      .map((field) => ({ key: KEYS[field], value: patch[field] as string[] }));

    if (rows.length > 0) {
      const { error } = await getSupabase()
        .from('settings')
        .upsert(rows, { onConflict: 'key' });
      if (error !== null) fail('save your settings', error);
    }

    return this.get();
  },
};
