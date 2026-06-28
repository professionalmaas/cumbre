-- Cumbre — database schema (Supabase / Postgres)
-- Apply in the Supabase SQL editor. This is the DB contract referenced by the build spec.
-- Principle: store derived features/scores, NEVER the audio or verbatim lyrics.

-- app profile (auth.users is managed by Supabase Auth)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now()
);

-- credit ledger: current balance = SUM(delta) for a user
create table if not exists credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade,
  delta int not null,                         -- + purchased/granted, - consumed
  reason text not null,                        -- 'purchase' | 'grant' | 'analysis' | 'refund'
  stripe_event_id text,                        -- idempotency for purchases (unique below)
  job_id uuid,
  created_at timestamptz default now()
);
create unique index if not exists credit_ledger_stripe_event_uniq
  on credit_ledger (stripe_event_id) where stripe_event_id is not null;

create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  storage_path text not null,                  -- Supabase Storage object path
  original_filename text,
  genre text not null check (genre in ('pop','edm','hiphop')),
  declared_year int,
  rights_warranty boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references songs(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status text not null default 'queued',       -- queued|running|needs_review|done|failed|rejected
  stage text,                                  -- validate|moderate|fingerprint|extract|score|feedback|charge|deliver
  model_version text,
  confidence numeric,
  flagged_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists results (
  job_id uuid primary key references jobs(id) on delete cascade,
  features jsonb,            -- engine feature vector (NOT audio, NOT lyrics text)
  music_score numeric,
  lyrics_score numeric,
  combined_grade text,
  subscores jsonb,
  top_fixes jsonb,
  feedback_md text,          -- generated feedback (no verbatim lyrics)
  created_at timestamptz default now()
);

create table if not exists review_queue (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  category text not null,    -- 'copyright'|'moderation'|'low_confidence'|'ood'|'payment'|'drift'
  payload jsonb,
  resolved boolean default false,
  resolution text,
  created_at timestamptz default now()
);

-- Row-Level Security: users see only their own rows; review_queue is admin-only (service role).
alter table profiles      enable row level security;
alter table credit_ledger enable row level security;
alter table songs         enable row level security;
alter table jobs          enable row level security;
alter table results       enable row level security;
alter table review_queue  enable row level security;

create policy "own profile"  on profiles      for all using (id = auth.uid());
create policy "own ledger"   on credit_ledger for select using (user_id = auth.uid());
create policy "own songs"    on songs         for all using (user_id = auth.uid());
create policy "own jobs"     on jobs          for select using (user_id = auth.uid());
create policy "own results"  on results       for select using (
  exists (select 1 from jobs j where j.id = results.job_id and j.user_id = auth.uid()));
-- review_queue: no user policy => only the service role (server) can read/write it.

-- helper: current balance
create or replace function current_credits(uid uuid)
returns int language sql stable as $$
  select coalesce(sum(delta), 0)::int from credit_ledger where user_id = uid;
$$;
