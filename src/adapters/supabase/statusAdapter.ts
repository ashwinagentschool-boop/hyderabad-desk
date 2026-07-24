/**
 * The source heartbeat, live for Reddit only.
 *
 * Reddit reads the Pi's real `fetch_logs` rows. The other four sources are
 * still on mock adapters this milestone, and those mock adapters report
 * their runs through the mock status store — so this adapter merges the
 * two rather than showing four permanently dead sources.
 *
 * The moment a source moves to the worker, delete it from `MOCK_SOURCES`
 * and it starts reading fetch_logs with no other change.
 */
import { statusAdapter as mockStatusAdapter } from '../mock/statusAdapter';
import type { SourceName, SourceStatus, StatusAdapter } from '../types';
import { fail, getSupabase, opt } from './client';

/** Sources the Pi worker actually writes. */
const LIVE_SOURCES: SourceName[] = ['reddit'];

/** Everything else still comes from the mock adapters in this build. */
const MOCK_SOURCES: SourceName[] = ['news', 'sheet', 'twitter', 'insta'];

/**
 * One row per source is all the strip renders, but Postgrest has no
 * `distinct on`. Reading the newest 50 and folding is exact while only one
 * source writes, and stays cheap when more do.
 */
const SCAN_ROWS = 50;

interface Row {
  source: string;
  status: string;
  items_fetched: number | null;
  items_classified: number | null;
  message: string | null;
  ran_at: string;
}

export const statusAdapter: StatusAdapter = {
  async list() {
    const { data, error } = await getSupabase()
      .from('fetch_logs')
      .select('source, status, items_fetched, items_classified, message, ran_at')
      .order('ran_at', { ascending: false })
      .limit(SCAN_ROWS);

    if (error !== null) fail('read the source heartbeat', error);

    const live: SourceStatus[] = [];
    const seen = new Set<string>();
    for (const row of data as unknown as Row[]) {
      if (seen.has(row.source)) continue; // newest row per source wins
      seen.add(row.source);
      if (!LIVE_SOURCES.includes(row.source as SourceName)) continue;
      live.push({
        source: row.source as SourceName,
        status: row.status === 'error' ? 'error' : 'ok',
        ranAt: row.ran_at,
        // "N new" is what the agent cares about, not how many the worker
        // looked at, so the classified count is the headline number.
        itemsCount: row.items_classified ?? row.items_fetched ?? undefined,
        message: opt(row.message),
      });
    }

    // A live source with no row yet is genuinely "never run" — leave it out
    // rather than borrowing a mock entry and claiming the Pi is healthy.
    const mock = await mockStatusAdapter.list();
    return [...live, ...mock.filter((s) => MOCK_SOURCES.includes(s.source))];
  },

  async report(status) {
    // fetch_logs is the worker's journal. The browser writing to it would
    // mean "synced 2m ago" when nothing had synced. Mock sources keep
    // reporting to the mock store so their tabs behave as before.
    if (LIVE_SOURCES.includes(status.source)) return;
    await mockStatusAdapter.report(status);
  },
};
