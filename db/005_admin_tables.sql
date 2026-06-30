-- Cumbre — admin enhancements (apply AFTER 004_billing_hardening.sql)
-- Adds: job_transitions audit table, review_queue enhancements, dashboard
-- materialized views, queue counter table, and missing performance indexes.
-- All DDL uses IF NOT EXISTS / DO NOTHING to be safely re-runnable.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. job_transitions — append-only audit trail (GoCardless Statesman pattern)
--    Every state change in the pipeline writes a row here. most_recent = true
--    marks the current state; claimed by locking that row before inserting the
--    next one, so concurrent transitions are serialised without a separate lock.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists job_transitions (
  id          uuid        primary key default gen_random_uuid(),
  job_id      uuid        not null references jobs(id) on delete cascade,
  from_state  text,                         -- null on first transition
  to_state    text        not null,
  actor_type  text        not null default 'system',  -- 'system'|'lambda'|'worker'|'admin'
  actor_id    text,                         -- admin email or Lambda function name
  step_name   text,                         -- validate|moderate|fingerprint|extract|score|charge|deliver
  metadata    jsonb,                        -- confidence, flag_reason, stripe_event_id, etc.
  most_recent boolean     not null default true,
  sort_key    int         not null default 1,
  created_at  timestamptz not null default now()
);

-- Unique: only one most_recent row per job at a time
create unique index if not exists job_transitions_most_recent_uniq
  on job_transitions (job_id) where most_recent;

-- Unique: monotonic sort key per job (prevents duplicate inserts)
create unique index if not exists job_transitions_sort_key_uniq
  on job_transitions (job_id, sort_key);

-- Dashboard query: recent transitions (admin audit log view)
create index if not exists job_transitions_recent_idx
  on job_transitions (job_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. review_queue enhancements — add priority, reviewer tracking, optimistic lock
--    Safe to run against a table that already has rows: all new columns nullable
--    or have defaults, so existing rows are unaffected.
-- ──────────────────────────────────────────────────────────────────────────────
alter table review_queue
  add column if not exists priority    int         not null default 2,
  add column if not exists version     int         not null default 1,
  add column if not exists reviewer_id text,
  add column if not exists flag_signals jsonb,
  add column if not exists claimed_at  timestamptz,
  add column if not exists decided_at  timestamptz,
  add column if not exists decision_note text;      -- optional short note (140 chars)

-- Priority index: P0 items first, oldest first within each priority
create index if not exists review_queue_priority_idx
  on review_queue (priority asc, created_at asc)
  where resolved = false;

-- SLA breach detection: find items older than 4 hours still open
create index if not exists review_queue_age_idx
  on review_queue (created_at asc)
  where resolved = false;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. queue_counters — real-time counters updated on every state transition.
--    Single PK lookup for the dashboard badge; avoids counting the full table.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists queue_counters (
  key        text        primary key,
  value      bigint      not null default 0,
  updated_at timestamptz not null default now()
);

insert into queue_counters (key, value)
values
  ('review_queue_open',   0),
  ('jobs_queued',         0),
  ('jobs_running',        0),
  ('jobs_done_today',     0)
on conflict (key) do nothing;

-- Back-fill the open review count from the current table state
update queue_counters
  set value = (select count(*) from review_queue where resolved = false)
where key = 'review_queue_open';

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Materialized views for dashboard analytics
--    Created WITH NO DATA — run `REFRESH MATERIALIZED VIEW CONCURRENTLY`
--    after applying this migration. In production, refresh via pg_cron or a
--    scheduled Lambda (see docs/AWS_RUNBOOK.md).
-- ──────────────────────────────────────────────────────────────────────────────
create materialized view if not exists mv_jobs_by_day as
select
  date_trunc('day', created_at) as day,
  status,
  count(*)::int                 as job_count
from jobs
where created_at >= current_date - interval '90 days'
group by 1, 2
with no data;

-- Unique index required for REFRESH CONCURRENTLY (non-blocking)
create unique index if not exists mv_jobs_by_day_uniq
  on mv_jobs_by_day (day, status);

create index if not exists mv_jobs_by_day_day_idx
  on mv_jobs_by_day (day desc);

create materialized view if not exists mv_review_queue_stats as
select
  date_trunc('day', created_at)             as day,
  category,
  count(*)                                  as total,
  count(*) filter (where resolved = true)   as resolved_count,
  count(*) filter (where resolved = false)  as open_count
from review_queue
group by 1, 2
with no data;

create unique index if not exists mv_review_queue_stats_uniq
  on mv_review_queue_stats (day, category);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Performance indexes missing from the initial schema
-- ──────────────────────────────────────────────────────────────────────────────

-- Partial index: only the active jobs the worker queue scans (99% smaller than full)
create index if not exists jobs_queued_partial_idx
  on jobs (created_at asc)
  where status = 'queued';

-- Status + time for admin table filtering and sorting
create index if not exists jobs_status_created_idx
  on jobs (status, created_at desc);

-- Fast lookup: admin review console joins jobs on user
create index if not exists jobs_user_status_idx
  on jobs (user_id, status, created_at desc);

-- Credit ledger: balance queries scan by user only; existing index covers user_id alone
-- but adding (user_id, created_at) improves date-range sub-queries on the ledger
create index if not exists credit_ledger_user_created_idx
  on credit_ledger (user_id, created_at desc);
