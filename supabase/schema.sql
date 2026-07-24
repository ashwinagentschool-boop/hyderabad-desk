-- ===================================================================
-- Hyderabad Desk — Supabase schema
--
-- Run this whole file in the Supabase SQL editor. It is IDEMPOTENT:
-- running it a second time makes no changes and throws no errors, so it
-- is safe to re-run after editing.
--
-- Covers the Reddit slice that goes live in this milestone:
--   reddit_posts   written by the Pi worker, triaged by the browser
--   leads          the whole pipeline (manual + promoted from Reddit)
--   settings       key/value config the worker AND the browser read
--   fetch_logs     the worker's heartbeat
--
-- Projects / tweets / news / insta / pad / chat stay on mock adapters
-- for now. Their tables are specified in NEXT.md.
--
-- Security model
--   authenticated  full CRUD on every table (single-user app)
--   anon           nothing (explicitly revoked, and no RLS policy)
--   service_role   bypasses RLS by design — this is the Pi worker
-- ===================================================================

-- gen_random_uuid() lives in pgcrypto. Supabase enables it by default;
-- this makes the file self-contained on a bare project.
create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- 1. reddit_posts
-- -------------------------------------------------------------------
-- The worker inserts; it NEVER updates triage_state. Triage is owned by
-- the browser, so a re-crawl can never resurrect a post the agent has
-- already dealt with.

create table if not exists public.reddit_posts (
  id             uuid primary key default gen_random_uuid(),
  reddit_id      text not null unique,
  username       text,
  title          text,
  body           text,
  subreddit      text,
  permalink      text,
  posted_at      timestamptz,
  fetched_at     timestamptz not null default now(),

  -- LLM classification (written once, at insert time)
  category       text check (category in (
                   'buyer_lead','seller_lead','rental_lead',
                   'advice_question','market_discussion','other')),
  summary        text,
  lead_potential text check (lead_potential in ('hot','warm','cold','none')),
  areas          text[],
  budget         text,
  property_type  text,
  classified_at  timestamptz,

  -- user triage (browser-owned)
  triage_state   text not null default 'pending'
                 check (triage_state in ('pending','saved','ignored'))
);

-- The pending queue, newest first. This is the Reddit tab's only query.
create index if not exists reddit_posts_triage_posted_idx
  on public.reddit_posts (triage_state, posted_at desc);

-- -------------------------------------------------------------------
-- 2. leads
-- -------------------------------------------------------------------
-- Mirrors the frontend's Lead interface. Owns the WHOLE pipeline: the
-- Reddit tab promotes a post into a lead here with source = 'reddit'.

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('reddit','manual')),
  name             text not null,
  phone            text,
  requirement      text not null,
  budget           text,
  area             text,
  status           text not null default 'new'
                   check (status in ('new','contacted','site_visit',
                                     'negotiation','closed','lost')),
  -- A bare date, not a timestamp: the UI compares it as a string against
  -- local today to decide "overdue".
  follow_up_date   date,
  notes            text,
  reddit_permalink text,
  subreddit        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists leads_status_idx      on public.leads (status);
create index if not exists leads_follow_up_idx   on public.leads (follow_up_date);
create index if not exists leads_updated_at_idx  on public.leads (updated_at desc);

-- updated_at must move on every write: the pipeline sorts by it, and the
-- client trusting its own clock would drift.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------
-- 3. settings
-- -------------------------------------------------------------------
-- One row per key, value is jsonb. This is the shared contract: the
-- browser edits `subreddits`, the Pi reads it on its next run.

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

-- Seed defaults. `do nothing` so a re-run never clobbers the agent's edits.
insert into public.settings (key, value) values
  ('subreddits',      '["hyderabadrealestate","hyderabad","IndiaInvestments"]'::jsonb),
  -- Kept for future use. Classification replaced keyword filtering: the
  -- worker sends every new post to the LLM and lets it decide.
  ('keywords',        '[]'::jsonb),
  -- Not used by the worker. The Twitter and Insta tabs are still on mock
  -- adapters, but they read their watchlists through the same Settings
  -- object, so live mode needs these rows to exist.
  ('twitter_handles', '["@RERA_Telangana","@CREDAIHyd","@HMDA_Hyd"]'::jsonb),
  ('insta_accounts',  '["@hyderabadrealty","@kokapet.homes"]'::jsonb)
on conflict (key) do nothing;

-- -------------------------------------------------------------------
-- 4. fetch_logs
-- -------------------------------------------------------------------
-- Append-only. Exactly one row per worker run. The header status strip
-- reads the newest row per source.

create table if not exists public.fetch_logs (
  id               bigint generated always as identity primary key,
  source           text not null,
  status           text not null check (status in ('ok','error')),
  items_fetched    integer,
  items_classified integer,
  message          text,
  ran_at           timestamptz not null default now()
);

create index if not exists fetch_logs_source_ran_idx
  on public.fetch_logs (source, ran_at desc);

-- -------------------------------------------------------------------
-- 5. Row level security
-- -------------------------------------------------------------------
-- The anon key ships inside the browser bundle, so RLS is the only thing
-- standing between a stranger and this data. Enable it everywhere.

alter table public.reddit_posts enable row level security;
alter table public.leads        enable row level security;
alter table public.settings     enable row level security;
alter table public.fetch_logs   enable row level security;

-- Single user: any signed-in account gets everything. When a second
-- agent is added, add a user_id column and narrow these to
-- `using (user_id = auth.uid())`.
drop policy if exists reddit_posts_authenticated on public.reddit_posts;
create policy reddit_posts_authenticated on public.reddit_posts
  for all to authenticated using (true) with check (true);

drop policy if exists leads_authenticated on public.leads;
create policy leads_authenticated on public.leads
  for all to authenticated using (true) with check (true);

drop policy if exists settings_authenticated on public.settings;
create policy settings_authenticated on public.settings
  for all to authenticated using (true) with check (true);

drop policy if exists fetch_logs_authenticated on public.fetch_logs;
create policy fetch_logs_authenticated on public.fetch_logs
  for all to authenticated using (true) with check (true);

-- No anonymous access. RLS alone would already return zero rows (there is
-- no anon policy), but revoking the grants makes the intent explicit and
-- fails loudly rather than silently returning [].
revoke all on public.reddit_posts from anon;
revoke all on public.leads        from anon;
revoke all on public.settings     from anon;
revoke all on public.fetch_logs   from anon;

-- service_role keeps its grants and bypasses RLS. That is the Pi worker.
grant all on public.reddit_posts to authenticated, service_role;
grant all on public.leads        to authenticated, service_role;
grant all on public.settings     to authenticated, service_role;
grant all on public.fetch_logs   to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
