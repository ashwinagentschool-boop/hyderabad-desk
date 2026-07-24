import type { LeadPotential, RedditCategory } from '../adapters/types';

export const CATEGORY_LABEL: Record<RedditCategory, string> = {
  buyer_lead: 'Buyer',
  seller_lead: 'Seller',
  rental_lead: 'Rental',
  advice_question: 'Advice',
  market_discussion: 'Discussion',
  other: 'Other',
};

/** Filter-chip order. 'other' has no chip — "All" is how you reach it. */
export const CATEGORY_FILTERS: RedditCategory[] = [
  'buyer_lead',
  'seller_lead',
  'rental_lead',
  'advice_question',
  'market_discussion',
];

export const POTENTIAL_LABEL: Record<LeadPotential, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
  none: '',
};

/** Filter chips for lead potential. 'none' is not worth filtering *to*. */
export const POTENTIAL_FILTERS: LeadPotential[] = ['hot', 'warm', 'cold'];

/**
 * Colour law: hue means something. Temperature is the one judgement on
 * this card worth reading at arm's length, so it is the only coloured
 * element — the category chip stays achromatic.
 *
 * Coral is free to mean "hot" here: every post in this tab came from
 * Reddit, so there is no provenance badge competing for it. True red stays
 * reserved for a lost lead.
 */
export const POTENTIAL_CLASS: Record<LeadPotential, string> = {
  hot: 'bg-reddit-bg text-reddit-ink',
  warm: 'bg-[var(--c-amber-bg)] text-[var(--c-amber-ink)]',
  cold: 'bg-[var(--c-gray-bg)] text-[var(--c-gray-ink)]',
  none: '',
};

const PROPERTY_LABEL: Record<string, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  plot: 'Plot',
  commercial: 'Commercial',
  land: 'Land',
  other: 'Property',
};

export function propertyLabel(type: string | undefined): string | undefined {
  if (type === undefined) return undefined;
  return PROPERTY_LABEL[type] ?? type;
}

/**
 * The requirement line a promoted lead starts with. The classifier's
 * summary is already one sentence written for a scanning agent, which is
 * exactly what this field wants.
 */
export function requirementFrom(summary: string, title: string): string {
  const text = summary.trim() === '' ? title.trim() : summary.trim();
  return text === '' ? 'Interested in property in Hyderabad' : text;
}
