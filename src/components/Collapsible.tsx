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
    <div className="bg-surface hairline overflow-hidden rounded-[14px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="tap hover:bg-sunken flex w-full items-center justify-between gap-2 px-4 text-left text-[14px] font-medium transition-colors"
      >
        <span className="inline-flex items-center gap-2.5">
          <Icon name="settings" size={15} className="text-muted" />
          {title}
        </span>
        <Icon
          name="chevron-down"
          size={12}
          className={`text-muted transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? (
        <div id={panelId} className="hairline-t rise px-4 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
