import type { Tweet, TwitterAdapter } from '../types';
import { agoIso, remote } from './_util';
import { statusAdapter } from './statusAdapter';

const TWEETS: Tweet[] = [
  {
    id: 'tw_1',
    handle: '@RERA_Telangana',
    text: 'Registration of 46 new projects completed this week. Buyers are advised to verify the RERA number on the portal before paying any booking amount.',
    postedAt: agoIso(52),
    url: 'https://x.com/RERA_Telangana/status/1001',
  },
  {
    id: 'tw_2',
    handle: '@HMDA_Hyd',
    text: 'Open plot auction for Mokila layout scheduled next month. Full schedule and EMD details on the HMDA portal from Monday.',
    postedAt: agoIso(140),
    url: 'https://x.com/HMDA_Hyd/status/1002',
  },
  {
    id: 'tw_3',
    handle: '@CREDAIHyd',
    text: 'Q2 absorption in the western corridor held steady despite the price correction chatter. Kokapet and Tellapur together took 38% of new launches.',
    postedAt: agoIso(310),
    url: 'https://x.com/CREDAIHyd/status/1003',
  },
  {
    id: 'tw_4',
    handle: '@HMDA_Hyd',
    text: 'Layout regularisation window extended by four weeks following requests from plot owners across the ORR growth corridor.',
    postedAt: agoIso(600),
    url: 'https://x.com/HMDA_Hyd/status/1004',
  },
  {
    id: 'tw_5',
    handle: '@RERA_Telangana',
    text: 'Action initiated against 12 promoters for advertising unregistered projects. Complaint portal remains open for affected allottees.',
    postedAt: agoIso(1180),
    url: 'https://x.com/RERA_Telangana/status/1005',
  },
  {
    id: 'tw_6',
    handle: '@CREDAIHyd',
    text: 'Input cost pressure on cement and steel has eased slightly this quarter. Members expect launch pricing to stay flat through the festive season.',
    postedAt: agoIso(1620),
    url: 'https://x.com/CREDAIHyd/status/1006',
  },
];

/** Handle list drives filtering — a live scraper would query per handle. */
function forHandles(handles: string[]): Tweet[] {
  const wanted = new Set(handles.map((h) => h.toLowerCase().replace(/^@/, '')));
  if (wanted.size === 0) return [];
  return TWEETS.filter((t) => wanted.has(t.handle.toLowerCase().replace(/^@/, ''))).sort(
    (a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt),
  );
}

export const twitterAdapter: TwitterAdapter = {
  async list() {
    return remote('X/Twitter', () => forHandles(TWEETS.map((t) => t.handle)));
  },

  async fetch(handles) {
    const tweets = await remote('X/Twitter', () => forHandles(handles));
    await statusAdapter.report({
      source: 'twitter',
      status: 'ok',
      ranAt: new Date().toISOString(),
      itemsCount: tweets.length,
    });
    return tweets;
  },
};
