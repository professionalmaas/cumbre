# Cumbre Improvement Plan — Teed Up for Y/N Review
**Date:** 2026-06-30 | **Status:** Research complete, awaiting approval | **Do NOT implement until Y**

Three work streams researched against 50+ sources (Stripe Radar, Linear, GoCardless, Bytebase,
AWS prescriptive guidance, OWASP, postgres.ai). Each section ends with a **Y/N ask**.

---

## Work Stream A: Security Hardening

Research basis: OWASP Top 10, AWS/Cognito/ECS hardening, Next.js App Router threat model.
Total estimated effort if all approved: ~86 hours. Organized by risk tier.

### A1 — P0: Do Before Marketing (30 hrs)

These are vulnerabilities that would cause immediate user harm or data loss if exploited.

| # | Fix | Why it's P0 |
|---|---|---|
| A1.1 | JWT cryptographic verification with `jose` | Server Components and Route Handlers that decode the Cognito JWT but don't cryptographically verify the signature let any attacker forge an admin session by crafting a payload with `"role": "admin"` |
| A1.2 | DAL-level auth re-verify in every Server Action | Next.js Server Actions are HTTP endpoints — they can be called directly. If auth is only checked in the UI, a bypass is trivial |
| A1.3 | IDOR: add `AND user_id = $authedUser` to every query | Every `SELECT * FROM jobs WHERE id = $id` without a user_id filter lets any logged-in user read any other user's job just by guessing/iterating IDs |
| A1.4 | Credit ledger: `SELECT FOR UPDATE` + `CHECK (balance >= 0)` | Without a row-level lock, two concurrent charge requests for the same user can both read `balance = 1`, both deduct, leaving `balance = -1`. The constraint is a safety net. |
| A1.5 | Security headers: CSP (nonce-based), HSTS, X-Frame-Options | Missing CSP allows XSS via any third-party script injection. Missing HSTS allows SSL stripping. No X-Frame-Options allows clickjacking. |
| A1.6 | S3 presigned URL: 15-min expiry + path scoped to `uploads/{userId}/` | Unlimited-expiry URLs or unscoped paths let a leaked URL be reused by anyone, or let a user upload to another user's path |
| A1.7 | Stripe webhook: `constructEvent(rawBody, sig, secret)` — raw body only | Pre-parsing the JSON body before passing to `constructEvent` breaks signature verification silently — Stripe will accept the webhook but the HMAC check never actually ran |
| A1.8 | Webhook idempotency table `stripe_events(event_id PRIMARY KEY)` | Without dedup, Stripe's guaranteed-at-least-once delivery means double-charges are possible on network retries |

**Scope of P0 changes:**
- `web/lib/auth.ts` — JWT verification via `jose`
- `web/lib/dal.ts` (or equivalent) — add `withAuth()` wrapper that verifies session on every Server Action
- `web/app/api/` Route Handlers — add user_id filters to all DB queries
- `web/app/api/stripe/webhook/route.ts` — raw body + constructEvent + idempotency table
- `infra/terraform/` — S3 presigned URL expiry + CORS scope
- `next.config.ts` — security headers

---

### A2 — P1: Complete Within First Week of Real Traffic (43 hrs)

| # | Fix | Why it's P1 |
|---|---|---|
| A2.1 | IAM task role: remove wildcard actions, scope to specific resource ARNs | ECS task role with `s3:*` or `lambda:*` means any RCE vulnerability in the app grants full AWS account access |
| A2.2 | RDS security group: only allows traffic from ECS task SG (no 0.0.0.0/0) | Confirmed correct in audit, but needs automated validation in TF module to prevent drift |
| A2.3 | Rate limiting on auth endpoints + upload endpoint | Without rate limits, credential stuffing and upload abuse are unlimited-cost attacks |
| A2.4 | Cognito: enable MFA for admin users (`admin_emails`) | Admin account takeover via phished password is the most common SaaS breach vector |
| A2.5 | Input validation: file type + size hard limits in the S3 presign handler | Prevent audio files from being bypassed to upload arbitrary file types |
| A2.6 | `use server` directive on all Server Actions + verify origin | Server Actions without origin checks accept cross-site requests |
| A2.7 | Error messages: never leak stack traces or DB errors to the response | Generic error IDs only; log full detail server-side |
| A2.8 | Dependency audit: `npm audit` + patch CVE-2025-29927 if Next.js < 15.2.3 | This CVE bypasses Next.js middleware auth on affected versions via `x-middleware-subrequest` header manipulation |

---

### A3 — P2: Within First Month (13 hrs)

| # | Fix |
|---|---|
| A3.1 | WAF: AWS WAF rule set on ALB — block common injection patterns, rate-limit per IP |
| A3.2 | CloudWatch alarms for 4xx spike, 5xx spike, Stripe webhook failures |
| A3.3 | Secrets rotation: schedule 90-day rotation on `STRIPE_SECRET_KEY`, `OPENAI_API_KEY` in Secrets Manager |
| A3.4 | Security scanning in CI: `npm audit` + `trivy` image scan in `deploy.yml` |

**P2 does NOT block launch.**

---

**→ Y/N: Approve security hardening (A1 only, A2+A3 after)?**
*(Recommend starting with P0 only — it's the smallest surface with the highest impact. A2 and A3 can follow in the next session.)*

---

## Work Stream B: Admin Dashboard + Manual Review UX

Research basis: Stripe Radar, Linear, Datadog, Sentry, Vercel admin patterns. shadcn/ui + TanStack Table confirmed as the right stack (already in the project).

### B1 — Dashboard Overview Page (`/admin/dashboard`)

**What gets built:**

**Row 1 — Pipeline Health (always-visible KPIs):**
- Jobs/hour area chart + KPI card with 7-day sparkline and delta (▲ +3.2%)
- Overall success rate KPI + rolling-average comparison ("compared to last 7 days")
- Per-step funnel chart: validate → moderate → fingerprint → worker → charge → deliver

**Row 2 — Latency:**
- p50 + p95 dual-line time series chart (week-over-week overlay)
- Per-step duration stacked bar (shows which step dominates)

**Row 3 — Operations:**
- Manual review queue depth gauge with green/amber/red bands (threshold: >50 = amber, >100 = red)
- p95 age of oldest item in review queue (alert if >4 hours)
- Active jobs vs. concurrency limit

**Row 4 — Revenue:**
- Stripe charge success rate radial gauge (<95% = alert)
- Revenue per day bar chart
- Failed charge count (leads to dunning)

**Chart library:** shadcn/ui built-in charts (Recharts 3 under the hood — already in your component system, no additional dependency).

**Real-time strategy:** SWR `refreshInterval: 10_000` for the job table. SSE Route Handler for queue depth badge (push updates without polling the full table). No WebSockets needed.

---

### B2 — Jobs Admin Table (`/admin/jobs`)

**What gets built:**

Enhanced data table replacing any existing basic table:

| Feature | Implementation |
|---|---|
| Server-side pagination | URL params as state (`?page=2&status=failed&q=song+title`) — bookmarkable, shareable |
| Column sorting + filtering | TanStack Table v8 `manualPagination + manualFiltering` |
| Status filter | Multi-select: Pending / Processing / Completed / Failed / Needs Review / Canceled |
| Search | Debounced 300ms input → `q=` param → server-side ILIKE |
| 6-state badge system | Color + icon: gray/clock (queued), blue/spinner (running), green/✓ (success), red/✗ (failed), orange/↺ (retry), gray/– (canceled) |
| Row expansion | Click row → inline step-duration breakdown (no full slide-over needed) |
| Bulk actions | Checkbox → sticky toolbar slides in: "Retry selected (12)" / "Export CSV" |
| Column visibility | Dropdown to show/hide columns; state persisted in URL |
| Pipeline timeline drill-down | Click job → shows per-step latency (validate: 120ms, worker: 4.2s, etc.) |
| Export | CSV/JSON of filtered view; large exports via server-side Route Handler stream |

**Keyboard shortcuts (Linear/Stripe pattern):**
`J`/`K` navigate rows, `X` select, `Cmd+A` select all, `?` shortcut overlay, `Esc` deselect.

---

### B3 — Manual Review Queue (`/admin/review`)

This is the human-in-the-loop review screen for jobs flagged by the confidence gate.

**What gets built (Stripe Radar pattern):**

**List panel (left 40%):**
- Queue sorted by: P0 (multi-signal flags) → P1 (>4h in queue) → P2 (standard)
- Each row: song title + artist + flag reason + time in queue + confidence score
- J/K keyboard navigation through the queue
- X to select + bulk approve/reject for obvious cases

**Detail slide-over (right 60%):**
- Song metadata: title, genre, upload time, user account
- Analysis result: summit score, grade, top 3 fixes (from the ML worker)
- Flag reason: specific signal that triggered review (e.g., "ACRCloud match: 0.87 confidence" or "moderation: explicit content flag")
- Confidence score + what the threshold is
- Reviewer action buttons: **Approve** (green) / **Reject** (red) / **Escalate** (orange)
- Short note field (140 chars max) — optional, structured reason codes preferred
- Audit timeline: who did what, when (below the action buttons)

**Keyboard flow:** `J` to move to next item → detail panel updates → `A` approve / `R` reject / `E` escalate → `J` to next. Full review without mouse.

**Undo toast (not confirmation dialog):** "Song approved — Undo" with 5-second window. Only truly irreversible actions (e.g., permanent ban) get a modal.

---

**Component files that would be created:**
```
web/components/admin/
├── KpiCard.tsx              (Server Component — display only)
├── JobStatusBadge.tsx       (Server Component — 6-state badge)
├── JobTable.tsx             ('use client' — TanStack + SWR polling)
├── ReviewQueue.tsx          ('use client' — J/K keyboard nav)
├── JobDetailPanel.tsx       ('use client' — slide-over, Esc dismisses)
├── BulkActionBar.tsx        ('use client' — slides in on first checkbox)
├── PipelineFunnelChart.tsx  ('use client' — shadcn BarChart/FunnelChart)
├── LatencyChart.tsx         ('use client' — shadcn LineChart, p50+p95)
└── QueueDepthGauge.tsx      ('use client' — Recharts RadialBar + SSE)

web/app/(admin)/
├── layout.tsx               (sidebar + nav)
├── page.tsx                 (dashboard overview)
├── jobs/page.tsx            (job admin table)
└── review/page.tsx          (manual review queue)
```

**Estimated effort:** 2–3 days for all three pages at production quality.

---

**→ Y/N: Approve admin dashboard + review queue (all three pages)?**
*(Can also approve individual pages: B1 only, or B2+B3 only if the review queue is higher priority.)*

---

## Work Stream C: Database Schema + Performance

Research basis: GoCardless Statesman, Stripe idempotency keys, postgres.ai zero-downtime patterns, RLS from AWS prescriptive guidance.

### C1 — New Table: `job_transitions` (Audit Trail)

The GoCardless pattern at 10B+ rows. Every state change in the pipeline becomes an immutable append-only row. This replaces any reliance on CloudWatch logs as the audit source of truth.

```sql
-- Schema (do not apply until approved):
CREATE TABLE job_transitions (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id       UUID NOT NULL REFERENCES jobs(id),
    from_state   TEXT,                  -- NULL on first transition
    to_state     TEXT NOT NULL,
    actor_id     UUID,                  -- NULL = automated step
    actor_type   TEXT,                  -- 'user' | 'worker' | 'lambda' | 'system'
    step_name    TEXT,                  -- 'validate' | 'moderate' | 'charge' | etc.
    metadata     JSONB,                 -- confidence_score, flag_reason, stripe_event_id, etc.
    most_recent  BOOLEAN NOT NULL,      -- only one TRUE per job_id (GoCardless pattern)
    sort_key     INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_id, sort_key),
    UNIQUE (job_id) WHERE most_recent   -- enforces one current state per job
);

-- Partial index: dashboard queries on recent transitions
CREATE INDEX CONCURRENTLY idx_job_transitions_recent
    ON job_transitions (job_id, created_at DESC)
    WHERE most_recent;
```

**What this unlocks:**
- Full pipeline audit trail per job (admin can see exactly what happened and when)
- Current job state is always one `WHERE most_recent` lookup away
- No separate logging infrastructure for audit purposes
- Concurrent-safe: transition claims lock the `most_recent` row atomically

---

### C2 — New Table: `review_queue` (Dedicated Human Review State Machine)

Currently, manual review items are probably tracked by a `status` field on `jobs`. This separates them into their own table so the reviewer workload is queryable independently.

```sql
-- Schema (do not apply until approved):
CREATE TYPE review_status AS ENUM (
    'pending',        -- newly flagged, awaiting human
    'in_review',      -- reviewer has claimed it
    'approved',       -- human approved, pipeline continues
    'rejected',       -- human rejected, job terminates
    'escalated'       -- passed to a specialist queue
);

CREATE TABLE review_queue (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id          UUID NOT NULL REFERENCES jobs(id),
    status          review_status NOT NULL DEFAULT 'pending',
    reviewer_id     UUID REFERENCES users(id),
    flag_reason     TEXT NOT NULL,
    flag_signals    JSONB,             -- e.g. {"acr_confidence": 0.87, "openai_flag": "adult"}
    confidence_score DECIMAL(5,4),    -- the ML confidence that triggered the flag
    decision        TEXT,              -- 'approve' | 'reject' | 'escalate'
    decision_note   TEXT,              -- optional 140-char reviewer note
    decision_codes  TEXT[],            -- structured: ['content_ok', 'acr_fp']
    version         INTEGER NOT NULL DEFAULT 1,  -- optimistic lock for concurrent reviewers
    priority        INTEGER NOT NULL DEFAULT 2,  -- 0=P0, 1=P1, 2=P2
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at      TIMESTAMPTZ,
    decided_at      TIMESTAMPTZ,
    UNIQUE (job_id)                    -- one review entry per job
);

-- The hot-path index: reviewer's queue view (only pending items, sorted by priority)
CREATE INDEX CONCURRENTLY idx_review_queue_pending
    ON review_queue (priority ASC, queued_at ASC)
    WHERE status = 'pending';

-- SLA monitoring: find items approaching 4-hour threshold
CREATE INDEX CONCURRENTLY idx_review_queue_age
    ON review_queue (queued_at ASC)
    WHERE status IN ('pending', 'in_review');
```

**What this unlocks:**
- Reviewer claims a row via optimistic lock (`WHERE version = $client_version`)
- P0/P1/P2 priority auto-assigned by flags + queue age
- SLA breach alertable via CloudWatch alarm on `max(queued_at) WHERE status='pending'`
- Queue depth gauge in dashboard reads from this table

---

### C3 — Materialized Views for Dashboard Metrics

Dashboard KPI queries that currently run as full aggregations on `jobs` on every page load.

```sql
-- Jobs per hour (do not apply until approved):
CREATE MATERIALIZED VIEW mv_jobs_per_hour AS
SELECT
    date_bin(INTERVAL '1 hour', created_at, TIMESTAMPTZ '2024-01-01') AS hour_bucket,
    status,
    COUNT(*) AS job_count
FROM jobs
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1, 2;

CREATE UNIQUE INDEX ON mv_jobs_per_hour (hour_bucket, status);

-- Revenue per day:
CREATE MATERIALIZED VIEW mv_revenue_per_day AS
SELECT
    DATE_TRUNC('day', created_at) AS day,
    COUNT(*) AS completed_jobs,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS succeeded,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
FROM jobs
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1;

CREATE UNIQUE INDEX ON mv_revenue_per_day (day);
```

**Refresh strategy:** `pg_cron` runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` every 30 minutes.
Dashboard charts query the MV instead of the raw `jobs` table — expected speedup: 50–200x on large datasets.

---

### C4 — Counter Table for Real-Time Queue Depth

The materialized view has 30-minute staleness — too slow for the queue depth badge that drives operational decisions. A counter table gives real-time values.

```sql
-- Singleton counter, upserted on every state transition (do not apply until approved):
CREATE TABLE queue_counters (
    key         TEXT PRIMARY KEY,     -- 'review_queue_pending', 'jobs_processing', etc.
    value       BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO queue_counters (key, value) VALUES
    ('review_queue_pending', 0),
    ('jobs_processing', 0),
    ('jobs_completed_today', 0);
```

Application upserts these on every job state transition. Dashboard reads `SELECT value FROM queue_counters WHERE key = 'review_queue_pending'` — one primary-key lookup, effectively free.

---

### C5 — RLS Policies (Admin vs. User Data Isolation)

Cumbre is currently single-tenant (one operator, many users), so RLS here is about ensuring users can only see their own data, not a neighbor's.

```sql
-- Enable RLS on user-owned tables (do not apply until approved):
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;  -- critical: FORCE closes the table-owner bypass gap

-- Users see only their own jobs
CREATE POLICY jobs_user_isolation
ON jobs FOR SELECT
TO app_user
USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- Admins see all jobs (for review queue + dashboard)
CREATE POLICY jobs_admin_all
ON jobs FOR ALL
TO app_admin
USING (true);

-- Same pattern on review_queue, job_transitions
```

**Migration safety note:** RLS must be added before any user data goes into production. If data already exists, policies apply immediately on `ENABLE` without needing a backfill.

---

### C6 — Index Additions for Admin Queries

Current indexes assumed to be missing or suboptimal:

```sql
-- For admin job list filtered by status (do not apply until approved):
CREATE INDEX CONCURRENTLY idx_jobs_status_created
    ON jobs (status, created_at DESC);

-- For user dashboard (user's own jobs, time-sorted):
CREATE INDEX CONCURRENTLY idx_jobs_user_created
    ON jobs (user_id, created_at DESC);

-- Partial: only pending jobs (90%+ smaller than full status index):
CREATE INDEX CONCURRENTLY idx_jobs_pending_only
    ON jobs (created_at ASC)
    WHERE status = 'pending';
```

All indexes use `CONCURRENTLY` to avoid locking the table during creation.

---

### C7 — Migration Safety Rules (Applied to All C1–C6)

Every migration in this plan will use:
- `lock_timeout = '50ms'` — fail fast instead of queuing behind a long-running query
- `statement_timeout = '30s'` — prevent any single DDL from blocking indefinitely
- `CREATE INDEX CONCURRENTLY` — no table locks on index creation
- Validate via `SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_name'::regclass` after each index
- NOT NULL columns added via 4-step safe pattern (add nullable → backfill → CHECK NOT VALID → VALIDATE → SET NOT NULL)

**Migration tool:** golang-migrate with `--no-transaction` flag per DDL-heavy migration file. Squawk linter added to CI to catch unsafe patterns before they're merged.

---

**→ Y/N: Approve database changes (all, or subset)?**

Suggested order if approving in pieces:
1. C5 (RLS) + C6 (indexes) first — pure safety/performance, no new tables
2. C1 (job_transitions) — audit trail, high value
3. C2 (review_queue) — required before B3 review page
4. C3 + C4 (MVs + counters) — dashboard optimization, lowest urgency

---

## Summary — The Three Y/N Decisions

| Work Stream | Scope | Estimated Effort | Risk if deferred |
|---|---|---|---|
| **A: Security (P0 only)** | 8 auth/payment hardening fixes | ~30 hrs | High — exploitable before first real user |
| **B: Admin Dashboard** | 3 new pages + ~10 components | ~16–24 hrs | Low — operational, not user-facing |
| **C: Database Schema** | 2 new tables + MVs + RLS + indexes | ~8 hrs | Medium — grows harder as data accumulates |

**Recommended approval order:**
1. **A1 (P0 security)** — highest urgency, must precede any marketing
2. **C (DB changes)** — easier to add before data accumulates
3. **B (Admin dashboard)** — can start in parallel with C

---

*Research completed 2026-06-30. Implementation deferred pending Y/N. All SQL and component
specs above are proposals — nothing has been written to the codebase.*
