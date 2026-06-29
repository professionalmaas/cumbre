-- Cumbre — pay-first entitlement (apply AFTER 001_schema.sql)
-- Two products: Summit Pass (one-time, 1 analysis -> credit_ledger) and
-- Season Pass (subscription, unlimited while active -> this table).

create table if not exists subscriptions (
  user_id                text primary key references users(sub) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'inactive',  -- active|trialing|past_due|canceled|inactive
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
create unique index if not exists subscriptions_stripe_sub_uniq
  on subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;
