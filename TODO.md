# What's left for you

Phase 1 (build) is done. These are the steps that need your credentials or
your hardware — I can't do them from here.

## Phase 1 → 2 checkpoint (do these, then reply "done")

1. **Fill `worker/.env`** with your real values (see `worker/.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`

2. **Fill `.env.local`** in the repo root (the frontend):
   - `VITE_DATA_MODE=live`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - (leave the `VERCEL_OIDC_TOKEN` line that's already there alone)
   - Never put the `service_role` key in this file.

3. **Run `supabase/schema.sql`** in the Supabase SQL editor
   (Supabase → SQL Editor → paste the whole file → Run). It's idempotent,
   so a re-run is safe.

4. **Confirm your auth user exists**: Supabase → Authentication → Users →
   Add user (email + password). There's no signup in the app by design.

Then reply **done** and I'll run the live verification (Phase 2).

## After Phase 2 passes — going live on Vercel

5. **Add the three `VITE_` variables to the Vercel project**
   (Project → Settings → Environment Variables), same values as
   `.env.local`. The `service_role` key does NOT go here.

6. **Redeploy.** Until these variables exist, production keeps running on
   mock adapters exactly as it does today — the live code falls back to
   mock when the variables are absent.

## Installing the worker on the Pi

7. **Follow `worker/PI_SETUP.md`** end to end: clone → venv → pip install →
   fill `.env` → smoke test → copy the systemd units → `daemon-reload` →
   `enable --now` the timer → verify with `systemctl list-timers` and
   `journalctl -u reddit-fetch`.

   Until the worker runs at least once, the Reddit tab will be empty and
   the status strip will show "Reddit · never synced" — that's correct, it
   means nothing has written to `reddit_posts` yet.

## Notes

- **Changing watched subreddits later needs no Pi access.** Edit the list
  in the app (Reddit tab → "Subreddits watched"); the worker reads it on
  its next run.
- **The other tabs are still mock.** Projects, Twitter, News, Insta, Pad
  and Chat are unchanged. `NEXT.md` lists what each needs to go live.
- **Reddit may 403 a cloud IP.** If you test the worker from a datacenter
  or CI box you may get `403 Blocked`. Run it from the Pi (a residential
  IP) — the custom User-Agent gets through there.
