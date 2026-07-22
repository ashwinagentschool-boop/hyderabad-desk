import type { SourceStatus, StatusAdapter } from '../types';
import { agoIso, local, read, readSeeded, write } from './_util';

const STORE = 'status';

/**
 * Mocked heartbeat. The live version reads the Pi worker's `fetch_logs`
 * table so the header strip can say "Reddit synced 12 min ago /
 * Twitter failed 2h ago" without the browser doing any fetching itself.
 */
const seed = (): SourceStatus[] => [
  { source: 'reddit', status: 'ok', ranAt: agoIso(12), itemsCount: 7 },
  { source: 'news', status: 'ok', ranAt: agoIso(34), itemsCount: 8 },
  { source: 'sheet', status: 'ok', ranAt: agoIso(180), itemsCount: 12 },
  {
    source: 'twitter',
    status: 'error',
    ranAt: agoIso(126),
    message: 'Rate limited by upstream (429)',
  },
  { source: 'insta', status: 'ok', ranAt: agoIso(420), itemsCount: 3 },
];

export const statusAdapter: StatusAdapter = {
  async list() {
    return local(() => readSeeded<SourceStatus[]>(STORE, seed));
  },

  async report(status) {
    return local(() => {
      const all = read<SourceStatus[]>(STORE, seed());
      const next = all.filter((s) => s.source !== status.source);
      next.push(status);
      write(STORE, next);
    });
  },
};
