-- Cumbre — teaser/paywall flip + magic-link auth support (apply AFTER 005_admin_tables.sql)
--
-- Paywall model change: running an analysis no longer requires a credit (upload gate removed
-- in the app layer). Every job produces a teaser by default; unlocking the FULL report is a
-- separate, per-job action gated on (subscription OR 1 credit) AND a completed profile
-- (display_name set). jobs.unlocked_full is the single source of truth the report page reads
-- — set once, at unlock time, decoupled from live entitlement state so a lapsed subscription
-- or spent-down credit balance never retroactively re-hides a report the user already paid for.

alter table jobs add column if not exists unlocked_full boolean not null default false;

-- Backfill: every job that exists today was created under the OLD pay-first model (no analysis
-- could run without hasAccess=true already being true), so every existing owner has already
-- seen their full report. Re-gating them now would be a hostile surprise, not a paywall.
update jobs set unlocked_full = true where unlocked_full = false;

-- ──────────────────────────────────────────────────────────────────────────────
-- Magic-link (CUSTOM_AUTH) challenge state. Never stores the raw token — only its
-- SHA-256 hash. request_id correlates three things that each only see part of the
-- picture: CreateAuthChallenge (knows the raw token, runs inside the AdminInitiateAuth
-- call), the startMagicLink server action (knows Cognito's Session string, returned by
-- that same AdminInitiateAuth call once it resolves), and the confirm-page server action
-- (only ever receives request_id + raw token, from the emailed link — possibly on a
-- different device than the one that started the flow).
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists magic_link_challenges (
  request_id      uuid primary key,
  email           text not null,
  token_hash      text not null,
  cognito_session text,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists magic_link_challenges_token_hash_idx on magic_link_challenges (token_hash);

-- Abuse guard for the now-free-to-run analysis pipeline (each run still costs real money in
-- worker compute + OpenAI/ACRCloud/Claude calls regardless of payment). The app enforces a
-- daily-per-user cap with a COUNT query against jobs(user_id, created_at) — already indexed
-- by jobs_user_idx (001_schema.sql), no new index needed here.
