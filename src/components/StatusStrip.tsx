import { useEffect } from 'react';
import type { SourceName, SourceStatus } from '../adapters/types';
import { relativeTime } from '../lib/format';
import { useStore } from '../store';
import { Icon } from './Icon';
import { Spinner } from './ui';

const SOURCE_LABEL: Record<SourceName, string> = {
  reddit: 'Reddit',
  news: 'News',
  sheet: 'Project sheet',
  twitter: 'Twitter',
  insta: 'Instagram',
};

const ORDER: SourceName[] = ['reddit', 'sheet', 'news', 'twitter', 'insta'];

export function allHealthy(statuses: SourceStatus[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s.status === 'ok');
}

/**
 * The one dot in the design system that is allowed to carry colour, because
 * it reports real state: whether the worker on the Pi last succeeded.
 */
export function StatusDot({ healthy }: { healthy: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[6px] shrink-0 rounded-full"
      style={{ background: healthy ? 'var(--c-ok)' : 'var(--c-err)' }}
    />
  );
}

/**
 * Collapsible per-source heartbeat, reachable from the header on every tab.
 * Reads statusAdapter, which will later be the Pi's fetch_logs table.
 */
export function StatusStrip() {
  const open = useStore((s) => s.statusStripOpen);
  const statuses = useStore((s) => s.statuses);
  const loadStatuses = useStore((s) => s.loadStatuses);

  useEffect(() => {
    if (open) void loadStatuses();
  }, [open, loadStatuses]);

  if (!open) return null;

  const bySource = new Map(statuses.items.map((s) => [s.source, s]));

  return (
    <div className="hairline-t bg-sunken rise px-4 py-3">
      {statuses.status === 'loading' && statuses.items.length === 0 ? (
        <p className="text-muted flex items-center gap-2 text-[13px]">
          <Spinner /> Checking sources
        </p>
      ) : statuses.status === 'error' && statuses.items.length === 0 ? (
        <p className="text-muted text-[13px]">Couldn't read the source heartbeat.</p>
      ) : (
        <ul className="mx-auto grid max-w-[1180px] gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER.map((source) => {
            const entry = bySource.get(source);
            const ok = entry?.status === 'ok';
            return (
              <li key={source} className="flex items-baseline gap-2 text-[13px]">
                <span className="translate-y-[-2px]">
                  <StatusDot healthy={ok} />
                </span>
                <span className="shrink-0 font-medium">{SOURCE_LABEL[source]}</span>
                <span className="text-muted truncate text-[12.5px]">
                  {entry === undefined
                    ? 'never run'
                    : ok
                      ? `${relativeTime(entry.ranAt)}${
                          entry.itemsCount !== undefined
                            ? `, ${entry.itemsCount} items`
                            : ''
                        }`
                      : `failed ${relativeTime(entry.ranAt)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Compact "synced 12m ago" line used inside individual tabs. */
export function SourceStatusLine({ source }: { source: SourceName }) {
  const statuses = useStore((s) => s.statuses);
  const loadStatuses = useStore((s) => s.loadStatuses);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const entry = statuses.items.find((s) => s.source === source);
  if (entry === undefined) return <span className="text-faint">never synced</span>;

  // Prose, not a column of comparable values, so no mono here.
  return (
    <span className="text-muted inline-flex items-center gap-1.5">
      <StatusDot healthy={entry.status === 'ok'} />
      <span>
        {entry.status === 'ok'
          ? `synced ${relativeTime(entry.ranAt)}`
          : `failed ${relativeTime(entry.ranAt)}`}
      </span>
    </span>
  );
}

/** Header affordance that opens the strip. */
export function StatusToggle() {
  const open = useStore((s) => s.statusStripOpen);
  const toggle = useStore((s) => s.toggleStatusStrip);
  const statuses = useStore((s) => s.statuses);
  const loadStatuses = useStore((s) => s.loadStatuses);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const healthy = allHealthy(statuses.items);
  const failing = statuses.items.filter((s) => s.status === 'error').length;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-label={
        healthy
          ? 'System status, all sources ok'
          : `System status, ${failing} source needs attention`
      }
      className="text-muted hover:text-ink hover:bg-sunken -mr-2 flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors"
    >
      <StatusDot healthy={healthy} />
      <span>{healthy ? 'All sources ok' : `${failing} source failing`}</span>
      <Icon
        name="chevron-down"
        size={11}
        className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}
