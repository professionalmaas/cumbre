-- Cumbre — billing hardening (apply AFTER 002_subscriptions.sql)
-- Event-level Stripe idempotency. Stripe delivers webhooks at-least-once and can
-- reorder them; we record each processed event id so a redelivery is a no-op. This
-- complements the per-purchase idempotency on credit_ledger.stripe_event_id — that one
-- guards a single side effect; this one short-circuits the whole handler on a duplicate.

create table if not exists processed_stripe_events (
  event_id     text primary key,
  type         text,
  processed_at timestamptz not null default now()
);
