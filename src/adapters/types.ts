/**
 * Data contract shared by the current mock adapters and the future
 * Supabase / Raspberry-Pi backend. Nothing in `src/components` or `src/tabs`
 * may read storage or call fetch directly — everything goes through the
 * interfaces declared here.
 *
 * Every method is async and backend-shaped (list / create / update / delete)
 * so a live implementation is a drop-in replacement.
 */

/* ------------------------------------------------------------------ *
 * Entities
 * ------------------------------------------------------------------ */

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'site_visit'
  | 'negotiation'
  | 'closed'
  | 'lost';

export type LeadSource = 'reddit' | 'manual';

export interface Lead {
  id: string;
  source: LeadSource;
  name: string;
  phone?: string;
  requirement: string;
  budget?: string;
  area?: string;
  status: LeadStatus;
  followUpDate?: string;
  notes?: string;
  redditPermalink?: string;
  subreddit?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * What the worker's LLM pass decided a post is. Keyword matching is gone —
 * the classifier reads every new post and files it here instead.
 */
export type RedditCategory =
  | 'buyer_lead'
  | 'seller_lead'
  | 'rental_lead'
  | 'advice_question'
  | 'market_discussion'
  | 'other';

/** How close this author is to being a client. 'none' means not a lead. */
export type LeadPotential = 'hot' | 'warm' | 'cold' | 'none';

export interface RedditPost {
  id: string;
  redditId: string;
  username: string;
  /** Reddit's own title. Secondary on the card, behind a disclosure. */
  title: string;
  /** Post body, often absent on link posts. */
  body?: string;
  /** The classifier's one-sentence read. This is the card's main text. */
  summary: string;
  /** Bare name, no "r/" prefix — the UI adds it. Matches the settings row. */
  subreddit: string;
  permalink: string;
  postedAt: string;
  category: RedditCategory;
  leadPotential: LeadPotential;
  /** Hyderabad localities the classifier found. Pre-fills the lead form. */
  areas: string[];
  budget?: string;
  propertyType?: string;
  classifiedAt?: string;
  triageState: 'pending' | 'saved' | 'ignored';
}

export interface Project {
  id: string;
  name: string;
  builder?: string;
  area: string;
  type: string;
  priceFrom?: string;
  priceTo?: string;
  sqftRange?: string;
  possession?: string;
  rera?: boolean;
  notes?: string;
}

export interface Tweet {
  id: string;
  handle: string;
  text: string;
  postedAt: string;
  url: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface InstaEntry {
  id: string;
  url: string;
  account?: string;
  note?: string;
  savedAt: string;
}

export type PadTag = 'lead' | 'project' | 'news' | 'idea';

export interface PadEntry {
  id: string;
  content: string;
  isLink: boolean;
  note?: string;
  tag?: PadTag;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export type SourceName = 'reddit' | 'news' | 'sheet' | 'twitter' | 'insta';

export interface SourceStatus {
  source: SourceName;
  status: 'ok' | 'error';
  ranAt: string;
  itemsCount?: number;
  message?: string;
}

export interface Settings {
  subreddits: string[];
  keywords: string[];
  twitterHandles: string[];
  instaAccounts: string[];
}

/* ------------------------------------------------------------------ *
 * Adapter interfaces
 * ------------------------------------------------------------------ */

/** Reddit triage feed. Live version reads rows the Pi worker wrote. */
export interface RedditAdapter {
  /** Pending posts, newest first. May reject (network / worker down). */
  listPending(): Promise<RedditPost[]>;
  /** Re-run the fetch and return the refreshed pending list. */
  refresh(): Promise<RedditPost[]>;
  /** Move a post out of the pending queue. */
  setTriageState(id: string, state: RedditPost['triageState']): Promise<RedditPost>;
}

/**
 * The unified lead pipeline. Owns BOTH manually-added leads and leads
 * promoted from Reddit — the Reddit tab calls `create` here.
 */
export interface ManualLeadsAdapter {
  list(): Promise<Lead[]>;
  create(input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead>;
  update(id: string, patch: Partial<Omit<Lead, 'id' | 'createdAt'>>): Promise<Lead>;
  delete(id: string): Promise<void>;
}

/** Read-only project inventory, synced from the agent's sheet. */
export interface ProjectsAdapter {
  list(): Promise<Project[]>;
  sync(): Promise<Project[]>;
}

export interface TwitterAdapter {
  list(): Promise<Tweet[]>;
  fetch(handles: string[]): Promise<Tweet[]>;
}

export interface NewsAdapter {
  list(): Promise<NewsItem[]>;
  fetch(): Promise<NewsItem[]>;
}

/** Saved Instagram links (persistent) + best-effort account scraping. */
export interface InstaAdapter {
  list(): Promise<InstaEntry[]>;
  create(input: Omit<InstaEntry, 'id' | 'savedAt'>): Promise<InstaEntry>;
  delete(id: string): Promise<void>;
  fetchAccounts(accounts: string[]): Promise<InstaEntry[]>;
}

export interface PadAdapter {
  list(): Promise<PadEntry[]>;
  create(input: Omit<PadEntry, 'id' | 'createdAt'>): Promise<PadEntry>;
  update(id: string, patch: Partial<Omit<PadEntry, 'id' | 'createdAt'>>): Promise<PadEntry>;
  delete(id: string): Promise<void>;
}

/**
 * Chat. `ask` is a single async round-trip so a live LLM endpoint can
 * replace the rule-based mock without touching the UI.
 */
export interface ChatAdapter {
  history(): Promise<ChatMessage[]>;
  ask(question: string): Promise<ChatMessage>;
  clear(): Promise<void>;
}

/** Per-source heartbeat. Live version reads the Pi's `fetch_logs` table. */
export interface StatusAdapter {
  list(): Promise<SourceStatus[]>;
  /** Record a run outcome so the UI's "synced 2m ago" stays honest. */
  report(status: SourceStatus): Promise<void>;
}

export interface SettingsAdapter {
  get(): Promise<Settings>;
  update(patch: Partial<Settings>): Promise<Settings>;
}

export interface Adapters {
  reddit: RedditAdapter;
  leads: ManualLeadsAdapter;
  projects: ProjectsAdapter;
  twitter: TwitterAdapter;
  news: NewsAdapter;
  insta: InstaAdapter;
  pad: PadAdapter;
  chat: ChatAdapter;
  status: StatusAdapter;
  settings: SettingsAdapter;
}

/** Thrown by mock fetch-style calls so the UI's retry path is real. */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterError';
  }
}
