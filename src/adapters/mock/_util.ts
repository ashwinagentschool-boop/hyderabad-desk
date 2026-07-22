/**
 * Shared plumbing for the mock adapters.
 *
 * This is the ONLY module in the app allowed to touch localStorage.
 * Components and tabs reach data exclusively through adapter interfaces.
 */
import { AdapterError } from '../types';

const NAMESPACE = 'hyd-re-dash';

/* ------------------------------------------------------------------ *
 * Simulated network conditions
 * ------------------------------------------------------------------ */

const MIN_LATENCY = 400;
const MAX_LATENCY = 900;
const FAILURE_RATE = 0.05;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const randomLatency = () =>
  MIN_LATENCY + Math.random() * (MAX_LATENCY - MIN_LATENCY);

/**
 * Fetch-style call: real latency + ~5% failures, so error/retry UI is
 * exercised in normal use.
 */
export async function remote<T>(label: string, produce: () => T): Promise<T> {
  await sleep(randomLatency());
  if (Math.random() < FAILURE_RATE) {
    throw new AdapterError(`Couldn't reach ${label}. Check the connection and retry.`);
  }
  return produce();
}

/**
 * User-data call: fast and never randomly fails. Leads, pad, insta and
 * settings must not lose the agent's own typing to a simulated blip.
 */
export async function local<T>(produce: () => T): Promise<T> {
  await sleep(60 + Math.random() * 90);
  return produce();
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

function key(name: string) {
  return `${NAMESPACE}:${name}`;
}

export function read<T>(name: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key(name));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or unavailable storage (private mode, quota) degrades to
    // in-memory defaults rather than crashing the tab.
    return fallback;
  }
}

export function write<T>(name: string, value: T): T {
  try {
    window.localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    /* storage unavailable — session stays usable, just not persistent */
  }
  return value;
}

/**
 * Read a store, seeding it on first ever use. Distinguishes "never seen"
 * from "user emptied it" so seeds don't reappear after a deliberate purge.
 */
export function readSeeded<T>(name: string, seed: () => T): T {
  const raw = (() => {
    try {
      return window.localStorage.getItem(key(name));
    } catch {
      return null;
    }
  })();
  if (raw !== null) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      /* fall through to reseed */
    }
  }
  return write(name, seed());
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

let counter = 0;

/** Stable-enough unique id. The backend will use uuid/bigserial instead. */
export function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export const nowIso = () => new Date().toISOString();

/** Minutes/hours/days ago as an ISO string — used to age the seed data. */
export const agoIso = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
