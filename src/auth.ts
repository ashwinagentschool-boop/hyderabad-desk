/**
 * Supabase Auth session state.
 *
 * Live mode is gated behind email + password. There is deliberately no
 * signup flow — the single user is created by hand in the Supabase
 * dashboard, so the login screen cannot be used to mint accounts against
 * a public anon key.
 *
 * In mock mode this store settles on 'disabled' and the gate renders the
 * app straight through, which is why the current Vercel deploy is
 * unaffected until the environment variables are added.
 */
import { create } from 'zustand';

import { liveEnabled } from './adapters';
import { getSupabase } from './adapters/supabase/client';

export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';

interface AuthState {
  status: AuthStatus;
  email: string | null;
  /** Set on a failed sign-in attempt; cleared when a new one starts. */
  error?: string;
  signingIn: boolean;

  init: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

function message(e: unknown): string {
  if (e instanceof Error) {
    // Supabase's own wording for a bad password is "Invalid login
    // credentials", which is fine, but the generic network failure is not.
    if (/fetch|network/i.test(e.message)) {
      return "Couldn't reach the server. Check the connection and try again.";
    }
    return e.message;
  }
  return 'Sign in failed. Try again.';
}

export const useAuth = create<AuthState>((set) => ({
  status: liveEnabled ? 'loading' : 'disabled',
  email: null,
  signingIn: false,

  init: () => {
    if (!liveEnabled) return;
    const supabase = getSupabase();

    void supabase.auth.getSession().then(({ data }) => {
      set({
        status: data.session === null ? 'signed-out' : 'signed-in',
        email: data.session?.user.email ?? null,
      });
    });

    // Covers token refresh, expiry and sign-out from another tab, so the
    // gate closes on its own rather than failing every query silently.
    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        status: session === null ? 'signed-out' : 'signed-in',
        email: session?.user.email ?? null,
      });
    });
  },

  signIn: async (email, password) => {
    set({ signingIn: true, error: undefined });
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error !== null) {
        set({ error: error.message, signingIn: false });
        return;
      }
      // onAuthStateChange flips `status`; nothing else to set here.
      set({ signingIn: false });
    } catch (e) {
      set({ error: message(e), signingIn: false });
    }
  },

  signOut: async () => {
    await getSupabase().auth.signOut();
    set({ status: 'signed-out', email: null });
  },
}));
