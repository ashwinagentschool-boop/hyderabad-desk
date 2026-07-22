import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

interface CardProps {
  children: React.ReactNode;
  /** Overdue follow-ups get the warm coral treatment. */
  tone?: 'default' | 'overdue';
  className?: string;
  onClick?: () => void;
}

export function Card({ children, tone = 'default', className = '', onClick }: CardProps) {
  const toneClass =
    tone === 'overdue'
      ? 'bg-overdue-bg border-[0.5px] border-overdue-border'
      : 'bg-surface hairline';
  const interactive = onClick !== undefined;

  return (
    <div
      className={`rounded-[11px] p-3.5 ${toneClass} ${
        interactive ? 'cursor-pointer active:opacity-80' : ''
      } ${className}`}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
    >
      {children}
    </div>
  );
}

/**
 * Root wrapper for every tab. The explicit `minmax(0, 1fr)` column is
 * load-bearing: with an implicit track, a full-bleed child like ChipRow
 * widens the track and the whole page gains a horizontal scrollbar.
 */
export function TabShell({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</div>;
}

/**
 * Single full-width column on mobile; auto-fitting card grid from 700px up.
 */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    // `minmax(0, 1fr)` on the mobile column, not just `grid`: an implicit
    // track grows to the widest card's min-content and pushes cards past the
    // screen edge. The 700px grid already uses minmax for the same reason.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[700px]:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  busy?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink border-[0.5px] border-transparent',
  secondary: 'bg-surface text-ink hairline',
  ghost: 'bg-transparent text-muted border-[0.5px] border-transparent',
  danger: 'bg-[var(--c-red-bg)] text-[var(--c-red-text)] border-[0.5px] border-transparent',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const sizing =
    size === 'sm'
      ? 'min-h-[34px] px-3 text-[13px]'
      : 'min-h-[44px] px-4 text-[14px]';
  return (
    <button
      type="button"
      disabled={disabled === true || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] font-medium ${sizing} ${VARIANT[variant]} disabled:opacity-45 ${className}`}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="spin-slow inline-block rounded-full border-2 border-current border-t-transparent opacity-60"
      style={{ width: size, height: size }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Async states
 * ------------------------------------------------------------------ */

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-surface hairline rounded-[11px] p-3.5">
          <div className="bg-sunken h-3 w-1/3 rounded" />
          <div className="bg-sunken mt-2.5 h-3 w-full rounded" />
          <div className="bg-sunken mt-2 h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}

export function ErrorCard({ message, onRetry, retrying = false }: ErrorCardProps) {
  return (
    <div
      role="alert"
      className="rounded-[11px] border-[0.5px] border-overdue-border bg-overdue-bg p-3.5"
    >
      <div className="flex items-start gap-2">
        <Icon name="alert" className="mt-[3px] text-[var(--c-err)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">Couldn't load this</p>
          <p className="text-muted mt-0.5 text-[13px]">{message}</p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={onRetry}
        busy={retrying}
      >
        <Icon name="refresh" />
        Retry
      </Button>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-surface hairline rounded-[11px] px-4 py-10 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      {hint !== undefined ? (
        <p className="text-muted mx-auto mt-1 max-w-[38ch] text-[13px]">{hint}</p>
      ) : null}
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

const FIELD =
  'w-full rounded-[9px] bg-surface hairline px-3 py-2.5 text-[15px] placeholder:text-faint';

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`${FIELD} min-h-[44px] ${className}`} {...rest} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea className={`${FIELD} resize-y ${className}`} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <span className="relative block">
      <select
        className={`${FIELD} min-h-[44px] appearance-none pr-9 ${className}`}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={11}
        className="text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      />
    </span>
  );
}

export function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 block text-[12px] font-medium">
        {label}
        {required ? <span className="text-[var(--c-err)]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Icon
        name="search"
        className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${FIELD} min-h-[44px] pl-9`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Filter chips
 * ------------------------------------------------------------------ */

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[34px] shrink-0 rounded-full px-3 text-[13px] font-medium whitespace-nowrap ${
        active
          ? 'bg-accent text-accent-ink border-[0.5px] border-transparent'
          : 'bg-surface text-muted hairline'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Chips bleed to the screen edges so the row reads as scrollable.
 * `min-w-0` is load-bearing: without it the automatic minimum size of this
 * grid item widens the whole column track and the page scrolls sideways.
 */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-0.5">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Modal — full-screen sheet on mobile, centred dialog on desktop
 * ------------------------------------------------------------------ */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="bg-surface relative flex h-full max-h-full w-full flex-col sm:h-auto sm:max-h-[85vh] sm:max-w-[520px] sm:rounded-[12px] sm:border-[0.5px] sm:border-[var(--c-border)]"
      >
        <header className="hairline-b flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="truncate text-[16px] font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted -mr-2 flex size-11 items-center justify-center rounded-[9px]"
          >
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer !== undefined ? (
          <footer className="hairline-t px-4 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Confirm — two-step inline destructive action
 * ------------------------------------------------------------------ */

export function ConfirmButton({
  onConfirm,
  label = 'Delete',
  confirmLabel = 'Really delete?',
  className = '',
}: {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <Button
      variant={armed ? 'danger' : 'ghost'}
      size="sm"
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      <Icon name="trash" />
      {armed ? confirmLabel : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * Section header used at the top of every tab
 * ------------------------------------------------------------------ */

export function TabHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[17px] font-medium">{title}</h1>
        {subtitle !== undefined ? (
          <p className="text-muted mt-0.5 text-[13px]">{subtitle}</p>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * Metadata separator. Decorative only — hidden from screen readers so a
 * card doesn't get read out as "Kokapet dot 3BHK dot 2.4 Cr".
 */
export function Dot({ spaced = false }: { spaced?: boolean }) {
  // `spaced` for runs of inline text, where there's no flex gap to lean on.
  return (
    <span aria-hidden="true" className={spaced ? 'text-faint mx-1.5' : 'text-faint'}>
      ·
    </span>
  );
}

/** Persistent muted advisory banner (Twitter / Insta best-effort notes). */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-sunken hairline text-muted rounded-[9px] px-3 py-2 text-[12.5px]">
      {children}
    </p>
  );
}

/** External link that never leaves the app in the same tab. */
export function ExternalLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex min-h-[34px] items-center gap-1.5 text-[13px] font-medium underline-offset-2 hover:underline ${className}`}
    >
      {children}
    </a>
  );
}
