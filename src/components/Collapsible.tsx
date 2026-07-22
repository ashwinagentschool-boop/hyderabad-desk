import { useId, useState } from 'react';
import { Icon } from './Icon';

/** Disclosure used for the in-tab settings panels. */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="bg-surface hairline overflow-hidden rounded-[11px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="tap flex w-full items-center justify-between gap-2 px-3.5 text-left text-[14px] font-medium"
      >
        <span className="inline-flex items-center gap-2">
          <Icon name="settings" className="text-muted" />
          {title}
        </span>
        <Icon
          name="chevron-down"
          size={12}
          className={`text-muted ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div id={panelId} className="hairline-t fade-in px-3.5 py-3.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}
