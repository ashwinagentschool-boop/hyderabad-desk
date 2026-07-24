/**
 * The single Supabase client for the browser.
 *
 * Created lazily so mock mode never constructs one, and so a live build
 * with unfilled placeholders degrades to mock (see `adapters/index.ts`)
 * rather than throwing at module load and white-screening the app.
 *
 * Only the anon key is ever used here. Row level security is what protects
 * the data; the service_role key belongs on the Pi and nowhere else.
 */
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';

import { AdapterError } from '../types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True only when both variables are present and are not the placeholders. */
export const supabaseConfigured =
  typeof url === 'string' &&
  url.startsWith('https://') &&
  typeof anonKey === 'string' &&
  anonKey.length > 20;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client === null) {
    if (!supabaseConfigured) {
      throw new AdapterError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      );
    }
    client = createClient(url as string, anonKey as string, {
      auth: {
        // The session lives in browser storage, managed entirely by
        // supabase-js. No application module touches it directly, so the
        // "storage only in the adapter layer" rule still holds.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Turn a Postgrest error into something the retry card can show a human.
 * The store puts `message` straight on screen, so it has to read as English.
 */
export function fail(action: string, error: PostgrestError | Error | null): never {
  const detail = error?.message ?? 'Unknown error';
  if (typeof (error as PostgrestError | null)?.code === 'string') {
    const code = (error as PostgrestError).code;
    if (code === 'PGRST301' || code === '42501') {
      throw new AdapterError(`Not allowed to ${action}. Try signing out and back in.`);
    }
  }
  throw new AdapterError(`Couldn't ${action}. ${detail}`);
}

/** Postgres returns null for an absent value; the UI expects undefined. */
export function opt(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
