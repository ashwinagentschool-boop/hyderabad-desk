import type { RedditAdapter, RedditPost } from '../types';
import { agoIso, local, read, readSeeded, remote, write } from './_util';
import { statusAdapter } from './statusAdapter';

const STORE = 'reddit-posts';

/** Buying-intent posts the Pi worker would have matched on keywords. */
const seed = (): RedditPost[] => [
  {
    id: 'rp_1',
    redditId: 't3_1a9xk2',
    username: 'u/kondapur_ravi',
    snippet:
      'Looking to buy a 3BHK in Kondapur or Gachibowli, budget around 1.4 Cr. Family of four, need it ready to move by December. Any builders worth trusting right now?',
    subreddit: 'r/hyderabad',
    permalink: 'https://reddit.com/r/hyderabad/comments/1a9xk2',
    postedAt: agoIso(38),
    matchedKeywords: ['3bhk', 'gachibowli', 'buy flat'],
    triageState: 'pending',
  },
  {
    id: 'rp_2',
    redditId: 't3_1a9v81',
    username: 'u/finance_noob_hyd',
    snippet:
      'Have about 85L saved and pre-approved for a 60L home loan. Is Kokapet still worth entering or has the price already run too far ahead?',
    subreddit: 'r/IndiaInvestments',
    permalink: 'https://reddit.com/r/IndiaInvestments/comments/1a9v81',
    postedAt: agoIso(97),
    matchedKeywords: ['kokapet', 'home loan', 'investment'],
    triageState: 'pending',
  },
  {
    id: 'rp_3',
    redditId: 't3_1a9tt0',
    username: 'u/sreeja_m',
    snippet:
      'Relocating from Pune to Madhapur next month for work. Want a 2BHK within 80L, ideally walking distance to the metro. Rent vs buy advice also welcome.',
    subreddit: 'r/hyderabad',
    permalink: 'https://reddit.com/r/hyderabad/comments/1a9tt0',
    postedAt: agoIso(155),
    matchedKeywords: ['buy flat', 'metro'],
    triageState: 'pending',
  },
  {
    id: 'rp_4',
    redditId: 't3_1a9r45',
    username: 'u/plotseeker_tg',
    snippet:
      'Anyone bought an HMDA-approved plot near Tellapur recently? Quoted 68k per sq yd and it feels steep. Trying to decide between plot and apartment for a 10-year hold.',
    subreddit: 'r/hyderabad',
    permalink: 'https://reddit.com/r/hyderabad/comments/1a9r45',
    postedAt: agoIso(240),
    matchedKeywords: ['plot', 'tellapur', 'investment'],
    triageState: 'pending',
  },
  {
    id: 'rp_5',
    redditId: 't3_1a9p12',
    username: 'u/nri_returning',
    snippet:
      'NRI here, moving back in March. Budget 2.5 Cr for a villa or large 4BHK along the ORR stretch. Which micro-market holds value best over the next decade?',
    subreddit: 'r/IndiaInvestments',
    permalink: 'https://reddit.com/r/IndiaInvestments/comments/1a9p12',
    postedAt: agoIso(330),
    matchedKeywords: ['villa', 'orr', 'investment'],
    triageState: 'pending',
  },
  {
    id: 'rp_6',
    redditId: 't3_1a9m77',
    username: 'u/sal_saver_92',
    snippet:
      'First-time buyer, 22L down payment ready. Looking at under-construction 2BHK in Bachupally or Tellapur under 70L. How risky is under-construction with a small builder?',
    subreddit: 'r/personalfinanceindia',
    permalink: 'https://reddit.com/r/personalfinanceindia/comments/1a9m77',
    postedAt: agoIso(480),
    matchedKeywords: ['2bhk', 'tellapur', 'home loan'],
    triageState: 'pending',
  },
  {
    id: 'rp_7',
    redditId: 't3_1a9j03',
    username: 'u/hyd_techie_ss',
    snippet:
      'Team is moving to the Kokapet office and I want to shift closer. Budget stretch is 1.8 Cr for a 3BHK with a decent clubhouse. Worth waiting six months for prices to cool?',
    subreddit: 'r/hyderabad',
    permalink: 'https://reddit.com/r/hyderabad/comments/1a9j03',
    postedAt: agoIso(700),
    matchedKeywords: ['3bhk', 'kokapet', 'buy flat'],
    triageState: 'pending',
  },
];

function all(): RedditPost[] {
  return readSeeded<RedditPost[]>(STORE, seed);
}

const byNewest = (a: RedditPost, b: RedditPost) =>
  Date.parse(b.postedAt) - Date.parse(a.postedAt);

export const redditAdapter: RedditAdapter = {
  async listPending() {
    return remote('Reddit', () =>
      all()
        .filter((p) => p.triageState === 'pending')
        .sort(byNewest),
    );
  },

  async refresh() {
    const pending = await remote('Reddit', () =>
      all()
        .filter((p) => p.triageState === 'pending')
        .sort(byNewest),
    );
    // Only a successful run updates the heartbeat — a thrown error above
    // leaves the previous "last synced" intact, like the real worker.
    await statusAdapter.report({
      source: 'reddit',
      status: 'ok',
      ranAt: new Date().toISOString(),
      itemsCount: pending.length,
    });
    return pending;
  },

  async setTriageState(postId, state) {
    return local(() => {
      const posts = all();
      const idx = posts.findIndex((p) => p.id === postId);
      if (idx === -1) throw new Error(`Unknown post ${postId}`);
      const updated = { ...posts[idx], triageState: state };
      posts[idx] = updated;
      write(STORE, posts);
      return updated;
    });
  },
};

/** Exposed for tests / debugging only — not part of the adapter contract. */
export const _readRedditStore = () => read<RedditPost[]>(STORE, []);
