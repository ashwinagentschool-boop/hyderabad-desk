import type { InstaAdapter, InstaEntry } from '../types';
import { agoIso, id, local, nowIso, readSeeded, remote, write } from './_util';
import { statusAdapter } from './statusAdapter';

const STORE = 'insta';

/** Saved posts persist locally and never randomly fail — user data. */
const seed = (): InstaEntry[] => [
  {
    id: 'ig_seed_1',
    url: 'https://www.instagram.com/p/CxKokapetTour/',
    account: '@hyderabadrealty',
    note: 'Walkthrough of the Neopolis clubhouse, good to send to Sandeep.',
    savedAt: agoIso(60 * 26),
  },
];

/** Best-effort account scrape results — Instagram limits automation. */
const DISCOVERED: InstaEntry[] = [
  {
    id: 'ig_fetch_1',
    url: 'https://www.instagram.com/p/CzTellapurLaunch/',
    account: '@hyderabadrealty',
    note: 'New Tellapur launch reel, 2BHK starting quote in the caption.',
    savedAt: agoIso(180),
  },
  {
    id: 'ig_fetch_2',
    url: 'https://www.instagram.com/p/CzKokapetSkyline/',
    account: '@kokapet.homes',
    note: 'Drone shot of the Kokapet skyline, useful for client pitches.',
    savedAt: agoIso(420),
  },
  {
    id: 'ig_fetch_3',
    url: 'https://www.instagram.com/p/CzPriceTrendCarousel/',
    account: '@kokapet.homes',
    note: 'Price-trend carousel for the western corridor.',
    savedAt: agoIso(900),
  },
];

function all(): InstaEntry[] {
  return readSeeded<InstaEntry[]>(STORE, seed);
}

export const instaAdapter: InstaAdapter = {
  async list() {
    return local(() =>
      all().sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)),
    );
  },

  async create(input) {
    return local(() => {
      const entry: InstaEntry = { ...input, id: id('ig'), savedAt: nowIso() };
      write(STORE, [entry, ...all()]);
      return entry;
    });
  },

  async delete(entryId) {
    return local(() => {
      write(
        STORE,
        all().filter((e) => e.id !== entryId),
      );
    });
  },

  async fetchAccounts(accounts) {
    const wanted = new Set(accounts.map((a) => a.toLowerCase().replace(/^@/, '')));
    const results = await remote('Instagram', () =>
      DISCOVERED.filter((e) =>
        wanted.has((e.account ?? '').toLowerCase().replace(/^@/, '')),
      ).map((e) => ({ ...e })),
    );
    await statusAdapter.report({
      source: 'insta',
      status: 'ok',
      ranAt: new Date().toISOString(),
      itemsCount: results.length,
    });
    return results;
  },
};
