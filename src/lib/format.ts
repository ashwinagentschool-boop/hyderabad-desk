import type { LeadStatus } from '../adapters/types';

/** "3m ago", "4h ago", "2d ago" — compact enough for a phone card header. */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1m ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Today as YYYY-MM-DD in local time — matches the follow-up date input. */
export function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "12 Mar" / "12 Mar 2026" for follow-up dates. */
export function shortDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Overdue = a follow-up in the past, on a lead that's still in play. */
export function isOverdue(followUpDate: string | undefined, status: LeadStatus): boolean {
  if (followUpDate === undefined) return false;
  if (status === 'closed' || status === 'lost') return false;
  return followUpDate < todayKey();
}

export function isDueToday(
  followUpDate: string | undefined,
  status: LeadStatus,
): boolean {
  if (followUpDate === undefined) return false;
  if (status === 'closed' || status === 'lost') return false;
  return followUpDate === todayKey();
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  site_visit: 'Site visit',
  negotiation: 'Negotiation',
  closed: 'Closed',
  lost: 'Lost',
};

export const STATUS_ORDER: LeadStatus[] = [
  'new',
  'contacted',
  'site_visit',
  'negotiation',
  'closed',
  'lost',
];

/** Loose link detection for the pad input — no protocol required. */
export function looksLikeLink(text: string): boolean {
  const t = text.trim();
  if (/\s/.test(t)) return false;
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t);
}

export function normalizeUrl(text: string): string {
  const t = text.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Shorten a URL for display: host + a hint of the path. */
export function prettyUrl(url: string, maxLength = 42): string {
  let display = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  display = display.replace(/\/$/, '');
  if (display.length <= maxLength) return display;
  return `${display.slice(0, maxLength - 1)}…`;
}
