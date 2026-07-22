import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ *
 * Layout shells
 * ------------------------------------------------------------------ */

/**
 * Root wrapper for every tab. The explicit `minmax(0, 1fr)` column is
 * load-bearing: with an implicit track, a full-bleed child like ChipRow
 * widens the track and the whole page gains a horizontal scrollbar.
 */
export function TabShell({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-5">{children}</div>;
}

/**
 * Single full-width column on mobile; auto-fitting grid from 700px up.
 * `minmax(0,1fr)` on the mobile column for the same reason as above.
 */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[700px]:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Card — 14px surface radius (shape law)
 * ------------------------------------------------------------------ */

interface CardProps {
  children: React.ReactNode;
  /** Overdue follow-ups get the warm attention treatment. */
  tone?: 'default' | 'overdue';
  className?: string;
  onClick?: () => void;
}

export function Card({ children, tone = 'default', className = '', onClick }: CardProps) {
  const toneClass =
    tone === 'overdue'
      ? 'bg-overdue-bg border border-overdue-border'
      : 'bg-surface hairline';
  const interactive = onClick !== undefined;

  return (
    <div
      className={`rounded-[14px] p-4 transition-colors duration-150 ${toneClass} ${
        interactive ? 'cursor-pointer active:scale-[0.995]' : ''
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

/* ------------------------------------------------------------------ *
 * Buttons — 10px control radius, tactile press
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  busy?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink border border-transparent hover:opacity-90',
  secondary: 'bg-surface text-ink hairline hover:border-hairline-strong',
  ghost: 'bg-transparent text-muted border border-transparent hover:text-ink',
  danger:
    'bg-[var(--c-red-bg)] text-[var(--c-red-ink)] border border-transparent hover:opacity-90',
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
    size === 'sm' ? 'min-h-[36px] px-3 text-[13px]' : 'min-h-[44px] px-4 text-[14px]';
  return (
    <button
      type="button"
      disabled={disabled === true || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap transition-[opacity,border-color,transform] duration-150 active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-40 ${sizing} ${VARIANT[variant]} ${className}`}
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
      className="spin-slow inline-block rounded-full border-2 border-current border-t-transparent opacity-50"
      style={{ width: size, height: size }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Async states
 * ------------------------------------------------------------------ */

/** Skeleton mirrors the real card's shape, never a generic spinner. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-surface hairline pulse-soft rounded-[14px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bg-sunken h-3.5 w-2/5 rounded-full" />
            <div className="bg-sunken h-3.5 w-12 rounded-full" />
          </div>
          <div className="bg-sunken mt-3 h-3 w-full rounded-full" />
          <div className="bg-sunken mt-2 h-3 w-4/6 rounded-full" />
          <div className="mt-4 flex gap-2">
            <div className="bg-sunken h-6 w-20 rounded-full" />
            <div className="bg-sunken h-6 w-14 rounded-full" />
          </div>
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
      className="rise border-overdue-border bg-overdue-bg rounded-[14px] border p-4"
    >
      <div className="flex items-start gap-2.5">
        <Icon name="alert" size={16} className="mt-[2px] text-[var(--c-err)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">Couldn't load this</p>
          <p className="text-muted mt-1 text-[13px] leading-[1.5]">{message}</p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3.5"
        onClick={onRetry}
        busy={retrying}
      >
        <Icon name="refresh" size={13} />
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
    <div className="bg-surface hairline rounded-[14px] px-5 py-12 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {hint !== undefined ? (
        <p className="text-muted mx-auto mt-1.5 max-w-[40ch] text-[13.5px] leading-[1.55]">
          {hint}
        </p>
      ) : null}
      {action !== undefined ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Inputs. Label above, error below, never placeholder-as-label.
 * ------------------------------------------------------------------ */

const FIELD =
  'w-full rounded-[10px] bg-surface hairline px-3 py-2.5 text-[15px] placeholder:text-faint transition-colors duration-150 hover:border-hairline-strong';

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`${FIELD} min-h-[44px] ${className}`} {...rest} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea className={`${FIELD} resize-y leading-[1.55] ${className}`} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <span className="relative block">
      <select
        className={`${FIELD} min-h-[44px] cursor-pointer appearance-none pr-9 ${className}`}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={12}
        className="text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      />
    </span>
  );
}

export function Field({
  label,
  required = false,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 flex items-baseline gap-1.5 text-[12.5px] font-medium">
        {label}
        {required ? (
          <span className="text-faint text-[11px] font-normal">required</span>
        ) : null}
      </span>
      {children}
      {error !== undefined ? (
        <span className="mt-1.5 block text-[12.5px] text-[var(--c-err)]">{error}</span>
      ) : hint !== undefined ? (
        <span className="text-faint mt-1.5 block text-[12.5px]">{hint}</span>
      ) : null}
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
        size={15}
        className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${FIELD} min-h-[44px] pl-9.5`}
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
      className={`min-h-[34px] shrink-0 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 active:translate-y-[1px] ${
        active
          ? 'bg-accent text-accent-ink border border-transparent'
          : 'bg-surface text-muted hairline hover:border-hairline-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Chips bleed to the screen edges so the row reads as scrollable.
 * `min-w-0` prevents the item's automatic minimum size widening the track.
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
        className="absolute inset-0 bg-[rgb(20_18_16/0.42)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="bg-surface rise relative flex h-full max-h-full w-full flex-col sm:h-auto sm:max-h-[86vh] sm:max-w-[540px] sm:rounded-[14px] sm:border sm:border-[var(--c-border)] sm:shadow-[var(--shadow-sheet)]"
      >
        <header className="hairline-b flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="truncate text-[16px] font-medium tracking-[-0.01em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink -mr-2 flex size-11 items-center justify-center rounded-[10px] transition-colors"
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer !== undefined ? (
          <footer className="hairline-t bg-surface px-4 py-3 sm:rounded-b-[14px]">
            {footer}
          </footer>
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
  confirmLabel = 'Confirm',
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
      <Icon name="trash" size={13} />
      {armed ? confirmLabel : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * Tab header
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
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
      <div className="min-w-0">
        <h1 className="text-[21px] leading-none font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle !== undefined ? (
          <div className="text-muted mt-2 text-[13px]">{subtitle}</div>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Persistent advisory banner for best-effort sources. */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted border-l-2 border-[var(--c-border-strong)] py-0.5 pl-3 text-[12.5px] leading-[1.5]">
      {children}
    </p>
  );
}

/** Metadata separator. Decorative, so hidden from screen readers. */
export function Dot({ spaced = false }: { spaced?: boolean }) {
  return (
    <span aria-hidden="true" className={spaced ? 'text-faint mx-1.5' : 'text-faint'}>
      ·
    </span>
  );
}

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
      className={`hover:text-ink inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium transition-colors ${className}`}
    >
      {children}
    </a>
  );
}
