import type { PadAdapter, PadEntry } from '../types';
import { agoIso, id, local, nowIso, readSeeded, write } from './_util';

const STORE = 'pad';

const seed = (): PadEntry[] => [
  {
    id: 'pd_seed_1',
    content: 'Farah wants title docs verified before any site visit. Get the EC copy.',
    isLink: false,
    tag: 'lead',
    createdAt: agoIso(190),
  },
  {
    id: 'pd_seed_2',
    content: 'https://telanganatoday.com/hyderabad-metro-phase-2',
    isLink: true,
    note: 'Metro Phase II, use in the Madhapur pitch',
    tag: 'news',
    createdAt: agoIso(640),
  },
];

function all(): PadEntry[] {
  return readSeeded<PadEntry[]>(STORE, seed);
}

export const padAdapter: PadAdapter = {
  async list() {
    return local(() =>
      all().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    );
  },

  async create(input) {
    return local(() => {
      const entry: PadEntry = { ...input, id: id('pd'), createdAt: nowIso() };
      write(STORE, [entry, ...all()]);
      return entry;
    });
  },

  async update(entryId, patch) {
    return local(() => {
      const entries = all();
      const idx = entries.findIndex((e) => e.id === entryId);
      if (idx === -1) throw new Error(`Unknown pad entry ${entryId}`);
      const updated: PadEntry = { ...entries[idx], ...patch };
      entries[idx] = updated;
      write(STORE, entries);
      return updated;
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
};
