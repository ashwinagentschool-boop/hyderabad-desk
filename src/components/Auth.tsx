import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { Icon } from './Icon';
import { Button, Field, Spinner, TextField } from './ui';

/**
 * Login gate for live mode.
 *
 * In mock mode the auth store settles on 'disabled' and this renders its
 * children straight through, so the existing deploy is untouched until the
 * Supabase environment variables are added.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  if (status === 'disabled' || status === 'signed-in') return <>{children}</>;

  if (status === 'loading') {
    // A restored session resolves in milliseconds. Anything heavier here
    // would flash the login form at a user who is already signed in.
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <Spinner /> Checking your session
        </span>
      </div>
    );
  }

  return <SignIn />;
}

/* ------------------------------------------------------------------ */

function SignIn() {
  const signIn = useAuth((s) => s.signIn);
  const signingIn = useAuth((s) => s.signingIn);
  const error = useAuth((s) => s.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() === '' || password === '') return;
    void signIn(email, password);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6">
          <h1 className="text-[21px] leading-none font-semibold tracking-[-0.02em]">
            Hyderabad Desk
          </h1>
          <p className="text-muted mt-2 text-[13.5px] leading-[1.5]">
            Sign in to reach your leads and the Reddit queue.
          </p>
        </div>

        <form onSubmit={submit} className="bg-surface hairline grid gap-3.5 rounded-[14px] p-4">
          <Field label="Email">
            <TextField
              type="email"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </Field>

          <Field label="Password">
            <TextField
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error !== undefined ? (
            <p role="alert" className="text-[12.5px] text-[var(--c-err)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" busy={signingIn} className="w-full">
            Sign in
          </Button>
        </form>

        {/* There is no signup flow on purpose: the single account is created
            by hand in the Supabase dashboard, so a public anon key can't be
            used to mint new ones. */}
        <p className="text-faint mt-4 text-[12px] leading-[1.5]">
          Accounts are created in the Supabase dashboard. There is no signup here.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Header affordance: who you are, and the way out. Live mode only. */
export function AccountMenu() {
  const status = useAuth((s) => s.status);
  const email = useAuth((s) => s.email);
  const signOut = useAuth((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status !== 'signed-in') return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={email === null ? 'Account' : `Account, signed in as ${email}`}
        className="text-muted hover:text-ink hover:bg-sunken flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors"
      >
        <Icon name="settings" size={13} />
        <Icon
          name="chevron-down"
          size={11}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="bg-surface rise absolute right-0 z-50 mt-1 w-[220px] rounded-[14px] border border-[var(--c-border)] p-1.5 shadow-[var(--shadow-sheet)]">
          {email !== null ? (
            <p className="text-faint truncate px-2.5 py-2 text-[12px]">{email}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut()}
            className="hover:bg-sunken flex min-h-[40px] w-full items-center rounded-[10px] px-2.5 text-left text-[13.5px] font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
