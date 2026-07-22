import type { LeadSource, LeadStatus } from '../adapters/types';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/format';
import { Icon } from './Icon';

/**
 * Colour law: hue is reserved for meaning. Provenance badges say where a
 * record came from; status pills say where it sits in the pipeline.
 * Nothing else on the page is coloured.
 */
const BASE =
  'inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] leading-[15px] font-medium whitespace-nowrap';

const SOURCE_CLASS: Record<LeadSource, string> = {
  reddit: 'bg-reddit-bg text-reddit-ink',
  manual: 'bg-manual-bg text-manual-ink',
};

export function SourceBadge({ source }: { source: LeadSource }) {
  return (
    <span className={`${BASE} ${SOURCE_CLASS[source]}`}>
      {source === 'reddit' ? 'Reddit' : 'Manual'}
    </span>
  );
}

export function TealBadge({ children }: { children: React.ReactNode }) {
  return <span className={`${BASE} bg-teal-bg text-teal-ink`}>{children}</span>;
}

/* ------------------------------------------------------------------ */

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: 'bg-[var(--c-new-bg)] text-[var(--c-new-ink)]',
  contacted: 'bg-[var(--c-amber-bg)] text-[var(--c-amber-ink)]',
  site_visit: 'bg-[var(--c-amber-bg)] text-[var(--c-amber-ink)]',
  negotiation: 'bg-[var(--c-green-bg)] text-[var(--c-green-ink)]',
  closed: 'bg-[var(--c-gray-bg)] text-[var(--c-gray-ink)]',
  lost: 'bg-[var(--c-red-bg)] text-[var(--c-red-ink)]',
};

export function StatusPill({ status }: { status: LeadStatus }) {
  return <span className={`${BASE} ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * The status pill IS the quick status control, so the card never shows
 * the same value twice.
 */
export function StatusSelect({
  status,
  label,
  onChange,
}: {
  status: LeadStatus;
  label: string;
  onChange: (next: LeadStatus) => void;
}) {
  return (
    <span
      className={`relative inline-flex items-center rounded-full ${STATUS_CLASS[status]}`}
    >
      <select
        aria-label={label}
        value={status}
        onChange={(e) => onChange(e.target.value as LeadStatus)}
        onClick={(e) => e.stopPropagation()}
        className="min-h-[34px] cursor-pointer appearance-none rounded-full bg-transparent py-1 pr-7 pl-3 text-[12.5px] font-medium"
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={11}
        className="pointer-events-none absolute right-2.5 opacity-70"
      />
    </span>
  );
}

/** Neutral chip: matched keywords, tags, subreddits. Carries no meaning. */
export function Chip({ children }: { children: React.ReactNode }) {
  return <span className={`${BASE} bg-sunken text-muted`}>{children}</span>;
}
