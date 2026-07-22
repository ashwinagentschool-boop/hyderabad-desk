import { useEffect, useRef } from 'react';
import { TAB_IDS, TAB_LABEL, type TabId } from '../lib/tabs';
import { useStore } from '../store';

/**
 * Pill tabs. On mobile the strip is the only thing that scrolls sideways;
 * at ≥700px all eight fit in one row.
 */
export function TabStrip() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const pendingReddit = useStore((s) => s.reddit.items.length);
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the active pill in view after a reload restores a far-right tab.
  // Sets scrollLeft directly rather than calling scrollIntoView, which would
  // also scroll the ancestors and drag the whole page sideways.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    const active = strip.querySelector<HTMLElement>('[data-active="true"]');
    if (active === null) return;
    const target =
      active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2;
    strip.scrollLeft = Math.max(0, target);
  }, [activeTab]);

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Sections"
      className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2.5 min-[700px]:justify-start"
    >
      {TAB_IDS.map((tab: TabId) => {
        const active = tab === activeTab;
        return (
          <button
            key={tab}
            role="tab"
            data-active={active}
            aria-selected={active}
            aria-controls={`panel-${tab}`}
            id={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap ${
              active
                ? 'bg-accent text-accent-ink border-[0.5px] border-transparent'
                : 'bg-surface text-muted hairline'
            }`}
          >
            {TAB_LABEL[tab]}
            {tab === 'reddit' && pendingReddit > 0 ? (
              <span
                className={`rounded-full px-1.5 text-[11px] leading-[16px] ${
                  // On the active pill, tint with the pill's own ink colour —
                  // white/20 would vanish against the light pill in dark mode.
                  active ? 'bg-accent-ink/20' : 'bg-reddit-bg text-reddit-ink'
                }`}
              >
                {pendingReddit}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
