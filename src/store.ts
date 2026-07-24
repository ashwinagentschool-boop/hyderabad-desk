/**
 * Single Zustand store. Every read and write goes through `adapters` —
 * no component or tab touches storage or the network directly.
 *
 * The one exception is `activeTab`, which is a pure UI preference and is
 * persisted by Zustand's `persist` middleware (see DECISIONS.md).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { adapters } from './adapters';
import type {
  ChatMessage,
  InstaEntry,
  Lead,
  NewsItem,
  PadEntry,
  Project,
  RedditPost,
  Settings,
  SourceStatus,
  Tweet,
} from './adapters/types';
import type { LeadFormValues } from './lib/leads';
import { isTabId, type TabId } from './lib/tabs';

/* ------------------------------------------------------------------ *
 * Async slice helper
 * ------------------------------------------------------------------ */

export type SliceStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Slice<T> {
  items: T[];
  status: SliceStatus;
  error?: string;
}

const emptySlice = <T>(): Slice<T> => ({ items: [], status: 'idle' });

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

/* ------------------------------------------------------------------ *
 * State shape
 * ------------------------------------------------------------------ */

interface AppState {
  /* UI */
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  statusStripOpen: boolean;
  toggleStatusStrip: () => void;

  /* Data slices */
  reddit: Slice<RedditPost>;
  leads: Slice<Lead>;
  projects: Slice<Project>;
  tweets: Slice<Tweet>;
  news: Slice<NewsItem>;
  insta: Slice<InstaEntry>;
  instaDiscovered: Slice<InstaEntry>;
  pad: Slice<PadEntry>;
  chat: Slice<ChatMessage>;
  statuses: Slice<SourceStatus>;

  settings: Settings | null;
  settingsStatus: SliceStatus;

  chatPending: boolean;

  /* Loaders — `force` re-fetches an already-loaded slice */
  loadReddit: (force?: boolean) => Promise<void>;
  loadLeads: (force?: boolean) => Promise<void>;
  loadProjects: (force?: boolean) => Promise<void>;
  loadTweets: (force?: boolean) => Promise<void>;
  loadNews: (force?: boolean) => Promise<void>;
  loadInsta: (force?: boolean) => Promise<void>;
  loadPad: (force?: boolean) => Promise<void>;
  loadChat: (force?: boolean) => Promise<void>;
  loadStatuses: (force?: boolean) => Promise<void>;
  loadSettings: (force?: boolean) => Promise<void>;

  /* Explicit user-triggered syncs */
  refreshReddit: () => Promise<void>;
  /** Background re-read of the Reddit queue. Never touches slice status. */
  pollReddit: () => Promise<void>;
  syncProjects: () => Promise<void>;
  fetchTweets: () => Promise<void>;
  fetchNews: () => Promise<void>;
  fetchInstaAccounts: () => Promise<void>;

  /* Mutations */
  triageRedditPost: (id: string, state: RedditPost['triageState']) => Promise<void>;
  saveRedditPostAsLead: (post: RedditPost, values: LeadFormValues) => Promise<Lead>;

  createLead: (input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateLead: (id: string, patch: Partial<Omit<Lead, 'id' | 'createdAt'>>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;

  createPadEntry: (input: Omit<PadEntry, 'id' | 'createdAt'>) => Promise<PadEntry>;
  updatePadEntry: (
    id: string,
    patch: Partial<Omit<PadEntry, 'id' | 'createdAt'>>,
  ) => Promise<void>;
  deletePadEntry: (id: string) => Promise<void>;

  createInstaEntry: (input: Omit<InstaEntry, 'id' | 'savedAt'>) => Promise<void>;
  deleteInstaEntry: (id: string) => Promise<void>;

  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  askChat: (question: string) => Promise<void>;
  clearChat: () => Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      /**
       * Runs a loader for one slice, managing status/error transitions.
       * Skips work when the slice is already loaded unless `force`.
       */
      async function load<K extends keyof AppState>(
        key: K,
        fetcher: () => Promise<unknown>,
        force: boolean,
      ) {
        const slice = get()[key] as unknown as Slice<unknown>;
        if (!force && (slice.status === 'ready' || slice.status === 'loading')) return;

        set({ [key]: { ...slice, status: 'loading', error: undefined } } as Partial<AppState>);
        try {
          const items = (await fetcher()) as unknown[];
          set({ [key]: { items, status: 'ready' } } as unknown as Partial<AppState>);
        } catch (e) {
          set({
            [key]: { items: slice.items, status: 'error', error: errorMessage(e) },
          } as unknown as Partial<AppState>);
        }
      }

      return {
        /* ---------------- UI ---------------- */
        activeTab: 'reddit',
        setActiveTab: (tab) => set({ activeTab: tab }),
        statusStripOpen: false,
        toggleStatusStrip: () => set((s) => ({ statusStripOpen: !s.statusStripOpen })),

        /* ---------------- Slices ---------------- */
        reddit: emptySlice<RedditPost>(),
        leads: emptySlice<Lead>(),
        projects: emptySlice<Project>(),
        tweets: emptySlice<Tweet>(),
        news: emptySlice<NewsItem>(),
        insta: emptySlice<InstaEntry>(),
        instaDiscovered: emptySlice<InstaEntry>(),
        pad: emptySlice<PadEntry>(),
        chat: emptySlice<ChatMessage>(),
        statuses: emptySlice<SourceStatus>(),
        settings: null,
        settingsStatus: 'idle',
        chatPending: false,

        /* ---------------- Loaders ---------------- */
        loadReddit: (force = false) =>
          load('reddit', () => adapters.reddit.listPending(), force),
        loadLeads: (force = false) => load('leads', () => adapters.leads.list(), force),
        loadProjects: (force = false) =>
          load('projects', () => adapters.projects.list(), force),
        loadTweets: (force = false) =>
          load('tweets', () => adapters.twitter.list(), force),
        loadNews: (force = false) => load('news', () => adapters.news.list(), force),
        loadInsta: (force = false) => load('insta', () => adapters.insta.list(), force),
        loadPad: (force = false) => load('pad', () => adapters.pad.list(), force),
        loadChat: (force = false) => load('chat', () => adapters.chat.history(), force),
        loadStatuses: (force = false) =>
          load('statuses', () => adapters.status.list(), force),

        loadSettings: async (force = false) => {
          const { settingsStatus } = get();
          if (!force && (settingsStatus === 'ready' || settingsStatus === 'loading')) return;
          set({ settingsStatus: 'loading' });
          try {
            set({ settings: await adapters.settings.get(), settingsStatus: 'ready' });
          } catch {
            set({ settingsStatus: 'error' });
          }
        },

        /* ---------------- Syncs ---------------- */
        refreshReddit: async () => {
          set((s) => ({ reddit: { ...s.reddit, status: 'loading', error: undefined } }));
          try {
            const items = await adapters.reddit.refresh();
            set({ reddit: { items, status: 'ready' } });
          } catch (e) {
            set((s) => ({
              reddit: { items: s.reddit.items, status: 'error', error: errorMessage(e) },
            }));
          }
          await get().loadStatuses(true);
        },

        /**
         * The Pi writes new posts on its own schedule, so the queue is
         * re-read in the background while the Reddit tab is open. This
         * deliberately never sets `loading` or `error`: a background poll
         * must not flash a skeleton over a list being triaged, and a
         * transient network blip must not replace it with a retry card.
         * The explicit Refresh button still reports failures.
         */
        pollReddit: async () => {
          if (get().reddit.status === 'loading') return;
          try {
            const items = await adapters.reddit.listPending();
            if (get().reddit.status === 'loading') return;
            set({ reddit: { items, status: 'ready' } });
          } catch {
            /* keep whatever is on screen */
          }
          try {
            set({ statuses: { items: await adapters.status.list(), status: 'ready' } });
          } catch {
            /* same */
          }
        },

        syncProjects: async () => {
          set((s) => ({ projects: { ...s.projects, status: 'loading', error: undefined } }));
          try {
            const items = await adapters.projects.sync();
            set({ projects: { items, status: 'ready' } });
          } catch (e) {
            set((s) => ({
              projects: { items: s.projects.items, status: 'error', error: errorMessage(e) },
            }));
          }
          await get().loadStatuses(true);
        },

        fetchTweets: async () => {
          const handles = get().settings?.twitterHandles ?? [];
          set((s) => ({ tweets: { ...s.tweets, status: 'loading', error: undefined } }));
          try {
            const items = await adapters.twitter.fetch(handles);
            set({ tweets: { items, status: 'ready' } });
          } catch (e) {
            set((s) => ({
              tweets: { items: s.tweets.items, status: 'error', error: errorMessage(e) },
            }));
          }
          await get().loadStatuses(true);
        },

        fetchNews: async () => {
          set((s) => ({ news: { ...s.news, status: 'loading', error: undefined } }));
          try {
            const items = await adapters.news.fetch();
            set({ news: { items, status: 'ready' } });
          } catch (e) {
            set((s) => ({
              news: { items: s.news.items, status: 'error', error: errorMessage(e) },
            }));
          }
          await get().loadStatuses(true);
        },

        fetchInstaAccounts: async () => {
          const accounts = get().settings?.instaAccounts ?? [];
          set((s) => ({
            instaDiscovered: { ...s.instaDiscovered, status: 'loading', error: undefined },
          }));
          try {
            const items = await adapters.insta.fetchAccounts(accounts);
            set({ instaDiscovered: { items, status: 'ready' } });
          } catch (e) {
            set((s) => ({
              instaDiscovered: {
                items: s.instaDiscovered.items,
                status: 'error',
                error: errorMessage(e),
              },
            }));
          }
          await get().loadStatuses(true);
        },

        /* ---------------- Mutations ---------------- */
        triageRedditPost: async (id, state) => {
          await adapters.reddit.setTriageState(id, state);
          set((s) => ({
            reddit: { ...s.reddit, items: s.reddit.items.filter((p) => p.id !== id) },
          }));
        },

        saveRedditPostAsLead: async (post, values) => {
          // The Reddit tab promotes a post through the leads adapter, so the
          // new lead shows up in Manual immediately. Everything the agent
          // can edit comes in as `values`; provenance is set here so the
          // form can never be used to fake a Reddit source.
          const lead = await adapters.leads.create({
            ...values,
            source: 'reddit',
            redditPermalink: post.permalink,
            subreddit: post.subreddit,
          });
          set((s) => ({ leads: { ...s.leads, items: [lead, ...s.leads.items] } }));
          await get().triageRedditPost(post.id, 'saved');
          return lead;
        },

        createLead: async (input) => {
          const lead = await adapters.leads.create(input);
          set((s) => ({ leads: { ...s.leads, items: [lead, ...s.leads.items] } }));
        },

        updateLead: async (id, patch) => {
          const lead = await adapters.leads.update(id, patch);
          set((s) => ({
            leads: {
              ...s.leads,
              items: s.leads.items.map((l) => (l.id === id ? lead : l)),
            },
          }));
        },

        deleteLead: async (id) => {
          await adapters.leads.delete(id);
          set((s) => ({
            leads: { ...s.leads, items: s.leads.items.filter((l) => l.id !== id) },
          }));
        },

        createPadEntry: async (input) => {
          const entry = await adapters.pad.create(input);
          set((s) => ({ pad: { ...s.pad, items: [entry, ...s.pad.items] } }));
          return entry;
        },

        updatePadEntry: async (id, patch) => {
          const entry = await adapters.pad.update(id, patch);
          set((s) => ({
            pad: { ...s.pad, items: s.pad.items.map((e) => (e.id === id ? entry : e)) },
          }));
        },

        deletePadEntry: async (id) => {
          await adapters.pad.delete(id);
          set((s) => ({
            pad: { ...s.pad, items: s.pad.items.filter((e) => e.id !== id) },
          }));
        },

        createInstaEntry: async (input) => {
          const entry = await adapters.insta.create(input);
          set((s) => ({ insta: { ...s.insta, items: [entry, ...s.insta.items] } }));
        },

        deleteInstaEntry: async (id) => {
          await adapters.insta.delete(id);
          set((s) => ({
            insta: { ...s.insta, items: s.insta.items.filter((e) => e.id !== id) },
          }));
        },

        updateSettings: async (patch) => {
          const settings = await adapters.settings.update(patch);
          set({ settings, settingsStatus: 'ready' });
        },

        askChat: async (question) => {
          const optimistic: ChatMessage = {
            id: `local_${question.length}_${get().chat.items.length}`,
            role: 'user',
            text: question,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({
            chat: { ...s.chat, items: [...s.chat.items, optimistic], status: 'ready' },
            chatPending: true,
          }));
          try {
            const reply = await adapters.chat.ask(question);
            set((s) => ({
              chat: { ...s.chat, items: [...s.chat.items, reply] },
              chatPending: false,
            }));
          } catch (e) {
            set((s) => ({
              chat: {
                ...s.chat,
                items: [
                  ...s.chat.items,
                  {
                    id: `err_${s.chat.items.length}`,
                    role: 'assistant',
                    text: `Couldn't answer that. ${errorMessage(e)}`,
                    createdAt: new Date().toISOString(),
                  },
                ],
              },
              chatPending: false,
            }));
          }
        },

        clearChat: async () => {
          await adapters.chat.clear();
          set({ chat: { items: [], status: 'ready' } });
        },
      };
    },
    {
      name: 'hyd-re-dash:ui',
      // Only the UI preference is persisted here; all domain data lives
      // behind the adapters.
      partialize: (state) => ({ activeTab: state.activeTab }),
      merge: (persisted, current) => {
        const saved = persisted as { activeTab?: unknown } | undefined;
        return {
          ...current,
          activeTab: isTabId(saved?.activeTab) ? saved.activeTab : current.activeTab,
        };
      },
    },
  ),
);
