import type { RedditAdapter, RedditPost } from '../types';
import { agoIso, local, read, readSeeded, remote, write } from './_util';
import { statusAdapter } from './statusAdapter';

// v2: the row shape changed when classification replaced keyword matching.
// A fresh key so an existing install doesn't render rows missing `summary`.
const STORE = 'reddit-posts-v2';

/**
 * Posts as the Pi worker would have stored them: raw title and body from
 * Reddit, plus the classifier's read of each one.
 */
const seed = (): RedditPost[] => [
  {
    id: 'rp_1',
    redditId: 't3_1a9xk2',
    username: 'u/kondapur_ravi',
    title: 'Which builders are worth trusting in Kondapur right now?',
    body: 'Looking to buy a 3BHK in Kondapur or Gachibowli, budget around 1.4 Cr. Family of four, need it ready to move by December. Any builders worth trusting right now?',
    summary:
      'Wants a ready-to-move 3BHK in Kondapur or Gachibowli by December, budget about 1.4 Cr.',
    subreddit: 'hyderabad',
    permalink: 'https://www.reddit.com/r/hyderabad/comments/1a9xk2',
    postedAt: agoIso(38),
    category: 'buyer_lead',
    leadPotential: 'hot',
    areas: ['Kondapur', 'Gachibowli'],
    budget: '1.4Cr',
    propertyType: 'apartment',
    classifiedAt: agoIso(35),
    triageState: 'pending',
  },
  {
    id: 'rp_2',
    redditId: 't3_1a9v81',
    username: 'u/finance_noob_hyd',
    title: 'Is Kokapet still worth entering?',
    body: 'Have about 85L saved and pre-approved for a 60L home loan. Is Kokapet still worth entering or has the price already run too far ahead?',
    summary:
      'Has 85L plus a 60L loan approval and is weighing whether Kokapet prices have already peaked.',
    subreddit: 'IndiaInvestments',
    permalink: 'https://www.reddit.com/r/IndiaInvestments/comments/1a9v81',
    postedAt: agoIso(97),
    category: 'buyer_lead',
    leadPotential: 'warm',
    areas: ['Kokapet'],
    budget: '1.45Cr',
    propertyType: 'apartment',
    classifiedAt: agoIso(95),
    triageState: 'pending',
  },
  {
    id: 'rp_3',
    redditId: 't3_1a9tt0',
    username: 'u/sreeja_m',
    title: 'Relocating to Madhapur next month, rent or buy?',
    body: 'Relocating from Pune to Madhapur next month for work. Want a 2BHK within 80L, ideally walking distance to the metro. Rent vs buy advice also welcome.',
    summary:
      'Relocating to Madhapur next month and wants a 2BHK under 80L within walking distance of the metro.',
    subreddit: 'hyderabad',
    permalink: 'https://www.reddit.com/r/hyderabad/comments/1a9tt0',
    postedAt: agoIso(155),
    category: 'buyer_lead',
    leadPotential: 'hot',
    areas: ['Madhapur'],
    budget: '80L',
    propertyType: 'apartment',
    classifiedAt: agoIso(150),
    triageState: 'pending',
  },
  {
    id: 'rp_4',
    redditId: 't3_1a9r45',
    username: 'u/plotseeker_tg',
    title: 'HMDA plot near Tellapur quoted at 68k per sq yd, is that steep?',
    body: 'Anyone bought an HMDA-approved plot near Tellapur recently? Quoted 68k per sq yd and it feels steep. Trying to decide between plot and apartment for a 10-year hold.',
    summary:
      'Weighing an HMDA plot near Tellapur quoted at 68k per sq yd against an apartment for a 10-year hold.',
    subreddit: 'hyderabad',
    permalink: 'https://www.reddit.com/r/hyderabad/comments/1a9r45',
    postedAt: agoIso(240),
    category: 'buyer_lead',
    leadPotential: 'warm',
    areas: ['Tellapur'],
    budget: '68k/sq yd',
    propertyType: 'plot',
    classifiedAt: agoIso(236),
    triageState: 'pending',
  },
  {
    id: 'rp_5',
    redditId: 't3_1a9p12',
    username: 'u/nri_returning',
    title: 'NRI moving back in March, which ORR micro-market holds value?',
    body: 'NRI here, moving back in March. Budget 2.5 Cr for a villa or large 4BHK along the ORR stretch. Which micro-market holds value best over the next decade?',
    summary:
      'Returning NRI wants a villa or large 4BHK along the ORR by March, budget 2.5 Cr.',
    subreddit: 'IndiaInvestments',
    permalink: 'https://www.reddit.com/r/IndiaInvestments/comments/1a9p12',
    postedAt: agoIso(330),
    category: 'buyer_lead',
    leadPotential: 'hot',
    areas: ['Kollur', 'Gachibowli'],
    budget: '2.5Cr',
    propertyType: 'villa',
    classifiedAt: agoIso(325),
    triageState: 'pending',
  },
  {
    id: 'rp_6',
    redditId: 't3_1a9m77',
    username: 'u/sal_saver_92',
    title: 'How risky is under-construction with a small builder?',
    body: 'First-time buyer, 22L down payment ready. Looking at under-construction 2BHK in Bachupally or Tellapur under 70L. How risky is under-construction with a small builder?',
    summary:
      'First-time buyer with 22L down asks about the risk of an under-construction 2BHK under 70L in Bachupally or Tellapur.',
    subreddit: 'hyderabadrealestate',
    permalink: 'https://www.reddit.com/r/hyderabadrealestate/comments/1a9m77',
    postedAt: agoIso(480),
    category: 'advice_question',
    leadPotential: 'warm',
    areas: ['Bachupally', 'Tellapur'],
    budget: '70L',
    propertyType: 'apartment',
    classifiedAt: agoIso(474),
    triageState: 'pending',
  },
  {
    id: 'rp_7',
    redditId: 't3_1a9j03',
    username: 'u/hyd_techie_ss',
    title: 'Will west Hyderabad prices cool off in the next six months?',
    body: 'Team is moving to the Kokapet office and I want to shift closer. Budget stretch is 1.8 Cr for a 3BHK with a decent clubhouse. Worth waiting six months for prices to cool?',
    summary:
      'Asks whether west Hyderabad prices will cool before buying a 1.8 Cr 3BHK near the Kokapet office.',
    subreddit: 'hyderabad',
    permalink: 'https://www.reddit.com/r/hyderabad/comments/1a9j03',
    postedAt: agoIso(700),
    category: 'market_discussion',
    leadPotential: 'none',
    areas: ['Kokapet'],
    budget: '1.8Cr',
    propertyType: 'apartment',
    classifiedAt: agoIso(690),
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
