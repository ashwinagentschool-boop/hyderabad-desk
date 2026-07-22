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

/** True when every source reported ok on its last run. */
export function allHealthy(statuses: SourceStatus[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s.status === 'ok');
}

export function StatusDot({ healthy }: { healthy: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[7px] rounded-full"
      style={{ background: healthy ? 'var(--c-ok)' : 'var(--c-err)' }}
    />
  );
}

/**
 * Collapsible per-source heartbeat, reachable from the header on every tab.
 * Reads the statusAdapter, which will later be the Pi's `fetch_logs` table.
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
    <div className="hairline-t bg-sunken px-4 py-3">
      {statuses.status === 'loading' && statuses.items.length === 0 ? (
        <p className="text-muted flex items-center gap-2 text-[13px]">
          <Spinner /> Checking sources…
        </p>
      ) : statuses.status === 'error' && statuses.items.length === 0 ? (
        <p className="text-muted text-[13px]">Couldn't read the source heartbeat.</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER.map((source) => {
            const entry = bySource.get(source);
            return (
              <li key={source} className="flex items-center gap-2 text-[13px]">
                <StatusDot healthy={entry?.status === 'ok'} />
                <span className="font-medium">{SOURCE_LABEL[source]}</span>
                <span className="text-muted truncate">
                  {entry === undefined
                    ? 'never run'
                    : entry.status === 'ok'
                      ? `synced ${relativeTime(entry.ranAt)}${
                          entry.itemsCount !== undefined ? ` · ${entry.itemsCount} items` : ''
                        }`
                      : `failed ${relativeTime(entry.ranAt)}${
                          entry.message !== undefined ? ` · ${entry.message}` : ''
                        }`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Compact "Reddit synced 12m ago" line used inside individual tabs. */
export function SourceStatusLine({ source }: { source: SourceName }) {
  const statuses = useStore((s) => s.statuses);
  const loadStatuses = useStore((s) => s.loadStatuses);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const entry = statuses.items.find((s) => s.source === source);
  if (entry === undefined) return <span className="text-faint">never synced</span>;

  return (
    <span className="text-muted inline-flex items-center gap-1.5">
      <StatusDot healthy={entry.status === 'ok'} />
      {entry.status === 'ok'
        ? `synced ${relativeTime(entry.ranAt)}`
        : `failed ${relativeTime(entry.ranAt)}`}
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

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-label={`System status — ${healthy ? 'all sources ok' : 'a source needs attention'}`}
      className="text-muted -mr-2 flex h-11 items-center gap-1.5 rounded-[9px] px-2 text-[12.5px] font-medium"
    >
      <StatusDot healthy={healthy} />
      <span className="hidden sm:inline">System</span>
      <Icon name="chevron-down" size={11} className={open ? 'rotate-180' : ''} />
    </button>
  );
}
