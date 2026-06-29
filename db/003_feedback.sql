-- Cumbre — active-learning feedback capture + shareable result tokens
-- Apply AFTER 001_schema.sql and 002_subscriptions.sql.
--
-- This is the CAPTURE half of the quality loop (see docs/QUALITY_LOOP.md): thumbs up/down
-- (plus an optional one-line note) on each Top-3 fix and on the overall report. Persisted
-- per (user, job, target, rank) so a user's later vote upserts their earlier one. The eval
-- /active-learning consumers read this table; nothing here stores audio or lyric text.

create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  user_id    text not null references users(sub) on delete cascade,
  target     text not null,                 -- 'fix' | 'report'
  rank       int,                            -- 1..3 for a fix; null for the overall report
  vote       text not null,                  -- 'up' | 'down'
  note       text,                           -- optional one-line, free text (no PII expected)
  created_at timestamptz not null default now(),
  constraint feedback_target_chk check (target in ('fix', 'report')),
  constraint feedback_vote_chk   check (vote in ('up', 'down')),
  -- a fix vote must carry a rank; a report vote must not
  constraint feedback_rank_chk check (
    (target = 'fix'    and rank between 1 and 3) or
    (target = 'report' and rank is null)
  )
);

-- One vote per user per target slot — re-voting upserts (see record_feedback()).
create unique index if not exists feedback_user_slot_uniq
  on feedback (user_id, job_id, target, coalesce(rank, 0));
create index if not exists feedback_job_idx on feedback (job_id);
create index if not exists feedback_created_idx on feedback (created_at desc);

-- Non-guessable public share token per result. A shared page exposes ONLY the summit score,
-- band, song title, and one-line verdict (no fixes/mix/comparables/methodology). The token is
-- generated when the report is delivered (steps/src/deliver.ts) and is independent of job_id so
-- the internal id is never exposed publicly.
alter table results add column if not exists share_token text;
create unique index if not exists results_share_token_uniq
  on results (share_token) where share_token is not null;
