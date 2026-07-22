import type { NewsAdapter, NewsItem } from '../types';
import { agoIso, remote } from './_util';
import { statusAdapter } from './statusAdapter';

/** Last 24 hours of Hyderabad real-estate coverage. */
const NEWS: NewsItem[] = [
  {
    id: 'nw_1',
    headline: 'HMDA clears layout regularisation for 1,200 plots along the ORR growth corridor',
    source: 'The Hindu',
    url: 'https://www.thehindu.com/news/cities/Hyderabad/',
    publishedAt: agoIso(45),
  },
  {
    id: 'nw_2',
    headline: 'Kokapet land parcel fetches record ₹100 crore per acre at HMDA auction',
    source: 'Times of India',
    url: 'https://timesofindia.indiatimes.com/city/hyderabad',
    publishedAt: agoIso(130),
  },
  {
    id: 'nw_3',
    headline: 'TG RERA orders refund with interest in 14 delayed-possession complaints',
    source: 'Deccan Chronicle',
    url: 'https://www.deccanchronicle.com/nation/current-affairs',
    publishedAt: agoIso(215),
  },
  {
    id: 'nw_4',
    headline: 'Metro Phase II alignment to Gachibowli gets state cabinet approval',
    source: 'Telangana Today',
    url: 'https://telanganatoday.com/hyderabad',
    publishedAt: agoIso(340),
  },
  {
    id: 'nw_5',
    headline: 'Western Hyderabad apartment prices up 9% year on year, says CREDAI report',
    source: 'Economic Times Realty',
    url: 'https://realty.economictimes.indiatimes.com/',
    publishedAt: agoIso(520),
  },
  {
    id: 'nw_6',
    headline: 'Registrations dip 6% in September as buyers wait out the festive discounts',
    source: 'Business Standard',
    url: 'https://www.business-standard.com/industry/news',
    publishedAt: agoIso(700),
  },
  {
    id: 'nw_7',
    headline: 'Tellapur and Kollur emerge as the fastest-absorbing mid-segment micro-markets',
    source: 'Moneycontrol',
    url: 'https://www.moneycontrol.com/news/business/real-estate/',
    publishedAt: agoIso(1010),
  },
  {
    id: 'nw_8',
    headline: 'Builders push possession-linked payment plans as under-construction demand cools',
    source: 'Hindustan Times',
    url: 'https://www.hindustantimes.com/cities/hyderabad-news',
    publishedAt: agoIso(1330),
  },
];

export const newsAdapter: NewsAdapter = {
  async list() {
    return remote('the news feed', () =>
      NEWS.map((n) => ({ ...n })).sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      ),
    );
  },

  async fetch() {
    const items = await remote('the news feed', () =>
      NEWS.map((n) => ({ ...n })).sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      ),
    );
    await statusAdapter.report({
      source: 'news',
      status: 'ok',
      ranAt: new Date().toISOString(),
      itemsCount: items.length,
    });
    return items;
  },
};
