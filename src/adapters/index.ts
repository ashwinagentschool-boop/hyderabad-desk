/**
 * Adapter selection point. `VITE_DATA_MODE=mock|live` chooses the set;
 * unset means mock. When the Supabase implementations land they go in
 * `src/adapters/supabase/` and get wired in here — no UI changes.
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

function selectAdapters(): Adapters {
  if (dataMode === 'live') {
    // The Supabase set isn't built yet. Fall back rather than crash the
    // app if someone flips the flag early — see NEXT.md.
    console.warn(
      '[adapters] VITE_DATA_MODE=live requested but no live adapters are built yet; using mock.',
    );
    return mockAdapters;
  }
  return mockAdapters;
}

export const adapters: Adapters = selectAdapters();

export * from './types';
