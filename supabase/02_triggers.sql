-- Cumbre — auth triggers & charge idempotency (apply AFTER schema.sql)
-- Additive only. schema.sql remains the table contract.

-- 1) On new auth user: create the profile row and grant the free first-song credit.
--    SECURITY DEFINER so it runs as the table owner (bypasses RLS for this insert).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  -- Free first analysis: one granted credit. reason='grant'; never charged to Stripe.
  insert into public.credit_ledger (user_id, delta, reason)
  values (new.id, 1, 'grant');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2) Idempotent analysis charge: at most one 'analysis' debit per job.
--    The Inngest step is already memoized per job, but this is a hard DB backstop
--    so a retry/replay can never double-charge.
create unique index if not exists credit_ledger_analysis_job_uniq
  on public.credit_ledger (job_id)
  where reason = 'analysis';

-- 3) Keep jobs.updated_at fresh on any update.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_touch_updated_at on jobs;
create trigger jobs_touch_updated_at
  before update on jobs
  for each row execute function touch_updated_at();
