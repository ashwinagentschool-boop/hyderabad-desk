/**
 * Adapter selection point. `VITE_DATA_MODE=live` swaps in the Supabase set;
 * unset (or anything else) means mock.
 *
 * Selection is PER ADAPTER, not all-or-nothing. This milestone moved the
 * Reddit slice — reddit, leads, settings, status — onto Supabase and the
 * Pi worker. Projects, Twitter, News, Insta, Pad and Chat are still mock
 * and still work exactly as they did; NEXT.md has what each needs.
 */
import type { Adapters } from './types';

import { chatAdapter } from './mock/chatAdapter';
import { instaAdapter } from './mock/instaAdapter';
import { manualLeadsAdapter } from './mock/manualLeadsAdapter';
import { newsAdapter } from './mock/newsAdapter';
import { padAdapter } from './mock/padAdapter';
import { projectsAdapter } from './mock/projectsAdapter';
import { redditAdapter } from './mock/redditAdapter';
import { settingsAdapter } from './mock/settingsAdapter';
import { statusAdapter } from './mock/statusAdapter';
import { twitterAdapter } from './mock/twitterAdapter';

import { supabaseConfigured } from './supabase/client';
import { manualLeadsAdapter as liveLeadsAdapter } from './supabase/manualLeadsAdapter';
import { redditAdapter as liveRedditAdapter } from './supabase/redditAdapter';
import { settingsAdapter as liveSettingsAdapter } from './supabase/settingsAdapter';
import { statusAdapter as liveStatusAdapter } from './supabase/statusAdapter';

const mockAdapters: Adapters = {
  reddit: redditAdapter,
  leads: manualLeadsAdapter,
  projects: projectsAdapter,
  twitter: twitterAdapter,
  news: newsAdapter,
  insta: instaAdapter,
  pad: padAdapter,
  chat: chatAdapter,
  status: statusAdapter,
  settings: settingsAdapter,
};

export type DataMode = 'mock' | 'live';

export const dataMode: DataMode =
  import.meta.env.VITE_DATA_MODE === 'live' ? 'live' : 'mock';

/**
 * True when live mode is requested AND usable. Live mode with missing or
 * placeholder Supabase variables falls back to mock with a warning rather
 * than white-screening — a half-configured deploy should still be a
 * working demo. This flag also gates the login screen.
 */
export const liveEnabled = dataMode === 'live' && supabaseConfigured;

function selectAdapters(): Adapters {
  if (dataMode === 'live' && !supabaseConfigured) {
    console.warn(
      '[adapters] VITE_DATA_MODE=live but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ' +
        'are missing or still placeholders; falling back to mock.',
    );
    return mockAdapters;
  }
  if (liveEnabled) {
    return {
      ...mockAdapters,
      reddit: liveRedditAdapter,
      leads: liveLeadsAdapter,
      settings: liveSettingsAdapter,
      status: liveStatusAdapter,
    };
  }
  return mockAdapters;
}

export const adapters: Adapters = selectAdapters();

export * from './types';
