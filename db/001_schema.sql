-- Cumbre — RDS Postgres schema (AWS-native build)
-- Ported from supabase/schema.sql. Differences from the Supabase version:
--   * No Supabase Auth: identity is the Cognito subject (text) in `users.sub`.
--   * No RLS: authorization is enforced in the app/Lambda data layer (every query
--     filters by user_id = current Cognito sub). RDS is private; no anon role exists.
--   * `storage_path` -> `storage_key` (S3 object key).
-- Principle is unchanged: store derived features/scores, NEVER the audio or verbatim lyrics.

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- App users, keyed by Cognito `sub`. Row is created on first authenticated request.
create table if not exists users (
  sub          text primary key,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Credit ledger: current balance = SUM(delta) for a user.
create table if not exists credit_ledger (
  id              bigint generated always as identity primary key,
  user_id         text not null references users(sub) on delete cascade,
  delta           int  not null,                -- + purchased/granted, - consumed
  reason          text not null,                -- 'purchase' | 'grant' | 'analysis' | 'refund'
  stripe_event_id text,                          -- idempotency for purchases
  job_id          uuid,
  created_at      timestamptz not null default now()
);
create unique index if not exists credit_ledger_stripe_event_uniq
  on credit_ledger (stripe_event_id) where stripe_event_id is not null;
-- Idempotent analysis charge: at most one 'analysis' debit per job.
create unique index if not exists credit_ledger_analysis_job_uniq
  on credit_ledger (job_id) where reason = 'analysis';
create index if not exists credit_ledger_user_idx on credit_ledger (user_id);

create table if not exists songs (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null references users(sub) on delete cascade,
  storage_key       text not null,               -- S3 object key
  original_filename text,
  genre             text not null,               -- design genre label (engine maps to pop/edm/hiphop)
  depth             text not null default 'deep',-- fast | deep (analysis depth)
  lens              text not null default 'ar',  -- listener | producer | ar (feedback voice)
  declared_year     int,
  rights_warranty   boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists jobs (
  id                uuid primary key default gen_random_uuid(),
  song_id           uuid not null references songs(id) on delete cascade,
  user_id           text not null references users(sub) on delete cascade,
  status            text not null default 'queued',  -- queued|running|needs_review|done|failed|rejected
  stage             text,                            -- validate|moderate|fingerprint|extract|score|charge|deliver
  model_version     text,
  confidence        numeric,
  flagged_reason    text,
  sfn_execution_arn text,                            -- Step Functions execution that owns this job
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists jobs_user_idx on jobs (user_id, created_at desc);

create table if not exists results (
  job_id         uuid primary key references jobs(id) on delete cascade,
  report         jsonb,            -- full analysis-contract.json `response` (NOT audio, NOT lyrics)
  music_score    numeric,          -- denormalized for quick listing/aggregates
  lyrics_score   numeric,
  overall_score  numeric,
  created_at     timestamptz not null default now()
);

create table if not exists review_queue (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  category   text not null,    -- 'copyright'|'moderation'|'low_confidence'|'ood'|'payment'|'drift'
  payload    jsonb,
  resolved   boolean not null default false,
  resolution text,
  created_at timestamptz not null default now()
);
create index if not exists review_queue_open_idx on review_queue (created_at) where resolved = false;

-- keep jobs.updated_at fresh
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists jobs_touch_updated_at on jobs;
create trigger jobs_touch_updated_at
  before update on jobs for each row execute function touch_updated_at();
