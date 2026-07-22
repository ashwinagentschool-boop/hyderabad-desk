import type { Settings, SettingsAdapter } from '../types';
import { local, readSeeded, write } from './_util';

const STORE = 'settings';

const seed = (): Settings => ({
  subreddits: ['hyderabad', 'IndiaInvestments', 'personalfinanceindia'],
  keywords: [
    'buy flat',
    '3bhk',
    'gachibowli',
    'kokapet',
    'home loan',
    'investment',
    'plot',
  ],
  twitterHandles: ['@RERA_Telangana', '@CREDAIHyd', '@HMDA_Hyd'],
  instaAccounts: ['@hyderabadrealty', '@kokapet.homes'],
});

export const settingsAdapter: SettingsAdapter = {
  async get() {
    return local(() => readSeeded<Settings>(STORE, seed));
  },

  async update(patch) {
    return local(() => {
      const current = readSeeded<Settings>(STORE, seed);
      return write(STORE, { ...current, ...patch });
    });
  },
};
