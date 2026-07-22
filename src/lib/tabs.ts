export const TAB_IDS = [
  'reddit',
  'manual',
  'projects',
  'twitter',
  'news',
  'insta',
  'pad',
  'chat',
] as const;

export type TabId = (typeof TAB_IDS)[number];

export const TAB_LABEL: Record<TabId, string> = {
  reddit: 'Reddit',
  manual: 'Manual',
  projects: 'Projects',
  twitter: 'Twitter',
  news: 'News',
  insta: 'Insta',
  pad: 'Pad',
  chat: 'Chat',
};

export function isTabId(value: unknown): value is TabId {
  return typeof value === 'string' && (TAB_IDS as readonly string[]).includes(value);
}
