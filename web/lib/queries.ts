import { query, one, tx } from "@/lib/db";
import type { Genre, Job, ReviewRow, ReviewRowEnhanced, JobsByDayPoint } from "@/lib/types";

// ---- users & credits ---------------------------------------------------------

// Provision the user row on first authenticated request and grant the free first
// credit exactly once (only when the row is newly created). Idempotent.
// TODO: clickwrap consent (persist tos_accepted_at + version on first authed request)
export async function ensureUser(sub: string, email: string | null): Promise<void> {
  await tx(async (c) => {
    const res = await c.query(
      `insert into users (sub, email) values ($1, $2)
       on conflict (sub) do nothing`,
      [sub, email]
    );
    if (res.rowCount && res.rowCount > 0) {
      // newly created -> grant the free first analysis
      await c.query(
        `insert into credit_ledger (user_id, delta, reason) values ($1, 1, 'grant')`,
        [sub]
      );
    } else if (email) {
      await c.query(`update users set email = $2 where sub = $1 and email is distinct from $2`, [
        sub,
        email,
      ]);
    }
  });
}

export async function getBalance(userId: string): Promise<number> {
  const row = await one<{ balance: string }>(
    `select coalesce(sum(delta), 0)::int as balance from credit_ledger where user_id = $1`,
    [userId]
  );
  return row ? Number(row.balance) : 0;
}

// ---- songs & jobs ------------------------------------------------------------

export async function createSongAndJob(input: {
  songId: string;
  userId: string;
  storageKey: string;
  originalFilename: string;
  genre: Genre;
  year: number;
}): Promise<{ jobId: string }> {
  return tx(async (c) => {
    await c.query(
      `insert into songs (id, user_id, storage_key, original_filename, genre, declared_year, rights_warranty)
       values ($1, $2, $3, $4, $5, $6, true)`,
      [input.songId, input.userId, input.storageKey, input.originalFilename, input.genre, input.year]
    );
    const job = await c.query<{ id: string }>(
      `insert into jobs (song_id, user_id, status, stage) values ($1, $2, 'queued', 'validate')
       returning id`,
      [input.songId, input.userId]
    );
    return { jobId: job.rows[0].id };
  });
}

export async function setJobExecution(jobId: string, executionArn: string): Promise<void> {
  await query(`update jobs set sfn_execution_arn = $2 where id = $1`, [jobId, executionArn]);
}

export interface JobWithSong
  extends Pick<Job, "id" | "status" | "stage" | "created_at" | "song_id" | "user_id"> {
  original_filename: string | null;
  genre: Genre;
}

export async function listJobs(userId: string, limit = 10): Promise<JobWithSong[]> {
  return query<JobWithSong>(
    `select j.id, j.status, j.stage, j.created_at, j.song_id, j.user_id,
            s.original_filename, s.genre
       from jobs j join songs s on s.id = j.song_id
      where j.user_id = $1
      order by j.created_at desc
      limit $2`,
    [userId, limit]
  );
}

// Job scoped to its owner (authorization is the WHERE clause).
export async function getJobForUser(
  jobId: string,
  userId: string
): Promise<(Pick<Job, "id" | "status" | "stage"> & { original_filename: string | null }) | null> {
  return one(
    `select j.id, j.status, j.stage, s.original_filename
       from jobs j join songs s on s.id = j.song_id
      where j.id = $1 and j.user_id = $2`,
    [jobId, userId]
  );
}

export async function getReportForUser(
  jobId: string,
  userId: string
): Promise<import("@/lib/report").AnalysisReport | null> {
  const row = await one<{ report: import("@/lib/report").AnalysisReport | null }>(
    `select r.report from results r
       join jobs j on j.id = r.job_id
      where r.job_id = $1 and j.user_id = $2`,
    [jobId, userId]
  );
  return row?.report ?? null;
}

// ---- active-learning feedback (capture half of the quality loop) -------------

export type FeedbackTarget = "fix" | "report";
export type FeedbackVote = "up" | "down";

// Record (or change) a user's vote on a Top-3 fix or the overall report. Authorization is
// the EXISTS check — a user can only leave feedback on a job they own. Upserts on the
// (user, job, target, rank) slot so re-voting replaces the prior vote. Idempotent.
export async function recordFeedback(input: {
  jobId: string;
  userId: string;
  target: FeedbackTarget;
  rank: number | null;
  vote: FeedbackVote;
  note: string | null;
}): Promise<{ ok: boolean }> {
  const owns = await one<{ id: string }>(
    `select id from jobs where id = $1 and user_id = $2`,
    [input.jobId, input.userId]
  );
  if (!owns) return { ok: false };

  await query(
    `insert into feedback (job_id, user_id, target, rank, vote, note)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, job_id, target, coalesce(rank, 0))
     do update set vote = excluded.vote, note = excluded.note, created_at = now()`,
    [input.jobId, input.userId, input.target, input.rank, input.vote, input.note]
  );
  return { ok: true };
}

// A user's existing votes for a job, so the report can render the current selection.
export async function getFeedbackForUser(
  jobId: string,
  userId: string
): Promise<{ target: FeedbackTarget; rank: number | null; vote: FeedbackVote }[]> {
  return query(
    `select target, rank, vote from feedback where job_id = $1 and user_id = $2`,
    [jobId, userId]
  );
}

// ---- shareable result token --------------------------------------------------

export interface SharePublic {
  title: string;
  overall: number;
  band: string;
  verdict: string;
}

// Public, methodology-free slice of a report by share token. Returns ONLY the score, band,
// song title and one-line verdict — never fixes, mix, comparables, or features.
export async function getSharePublic(token: string): Promise<SharePublic | null> {
  const row = await one<{ report: import("@/lib/report").AnalysisReport | null }>(
    `select report from results where share_token = $1`,
    [token]
  );
  const r = row?.report;
  if (!r) return null;
  return {
    title: r.song?.title || "An independent track",
    overall: r.scores?.overall ?? 0,
    band: r.scores?.band ?? "ascending",
    verdict: r.scores?.verdict ?? "",
  };
}

// The share token for a job the user owns (generated at deliver-time). Null if not yet set.
export async function getShareToken(jobId: string, userId: string): Promise<string | null> {
  const row = await one<{ share_token: string | null }>(
    `select r.share_token from results r join jobs j on j.id = r.job_id
      where r.job_id = $1 and j.user_id = $2`,
    [jobId, userId]
  );
  return row?.share_token ?? null;
}

// ---- admin review console ----------------------------------------------------

export async function listOpenReviews(): Promise<ReviewRow[]> {
  return query<ReviewRow>(
    `select id, job_id, category, payload, created_at
       from review_queue where resolved = false order by created_at asc`
  );
}

// Enhanced: joins jobs + songs for richer context in the review UI.
export async function listOpenReviewsEnhanced(): Promise<ReviewRowEnhanced[]> {
  return query<ReviewRowEnhanced>(
    `select
       rq.id, rq.job_id, rq.category, rq.payload, rq.created_at,
       coalesce(rq.priority, 2)  as priority,
       coalesce(rq.version, 1)   as version,
       rq.reviewer_id, rq.claimed_at, rq.decided_at,
       rq.decision_note, rq.flag_signals,
       j.status  as job_status,
       j.confidence,
       j.flagged_reason,
       s.original_filename,
       s.genre
     from review_queue rq
     join  jobs  j on j.id = rq.job_id
     left join songs s on s.id = j.song_id
     where rq.resolved = false
     order by rq.priority asc, rq.created_at asc`
  );
}

export async function approveReview(reviewId: string): Promise<void> {
  await tx(async (c) => {
    const r = await c.query<{ job_id: string }>(
      `select job_id from review_queue where id = $1`,
      [reviewId]
    );
    if (!r.rows[0]) return;
    // Human override: the content cleared review — mark job as done so the
    // results page shows the report (if results row exists) or as queued for retry.
    const hasResult = await c.query<{ exists: boolean }>(
      `select exists(select 1 from results where job_id = $1) as exists`,
      [r.rows[0].job_id]
    );
    const newStatus = hasResult.rows[0]?.exists ? "done" : "queued";
    await c.query(`update jobs set status = $2 where id = $1`, [r.rows[0].job_id, newStatus]);
    await c.query(
      `update review_queue set resolved = true, resolution = 'approved', decided_at = now() where id = $1`,
      [reviewId]
    );
  });
}

export async function claimReview(reviewId: string, adminEmail: string): Promise<boolean> {
  const res = await query<{ id: string }>(
    `update review_queue
        set reviewer_id = $2, claimed_at = now(), version = version + 1
      where id = $1 and reviewer_id is null and resolved = false
      returning id`,
    [reviewId, adminEmail]
  );
  return res.length > 0;
}

export async function rejectReview(reviewId: string): Promise<void> {
  await tx(async (c) => {
    const r = await c.query<{ job_id: string }>(
      `select job_id from review_queue where id = $1`,
      [reviewId]
    );
    if (!r.rows[0]) return;
    await c.query(`update jobs set status = 'rejected' where id = $1`, [r.rows[0].job_id]);
    await c.query(
      `update review_queue set resolved = true, resolution = 'rejected' where id = $1`,
      [reviewId]
    );
  });
}

export async function refundReview(reviewId: string): Promise<void> {
  await tx(async (c) => {
    const r = await c.query<{ job_id: string; user_id: string }>(
      `select rq.job_id, j.user_id from review_queue rq join jobs j on j.id = rq.job_id where rq.id = $1`,
      [reviewId]
    );
    const row = r.rows[0];
    if (!row) return;
    await c.query(
      `insert into credit_ledger (user_id, delta, reason, job_id) values ($1, 1, 'refund', $2)`,
      [row.user_id, row.job_id]
    );
    await c.query(`update jobs set status = 'rejected' where id = $1`, [row.job_id]);
    await c.query(
      `update review_queue set resolved = true, resolution = 'refunded' where id = $1`,
      [reviewId]
    );
  });
}

export async function dismissReview(reviewId: string): Promise<void> {
  await query(
    `update review_queue set resolved = true, resolution = 'dismissed' where id = $1`,
    [reviewId]
  );
}

// ---- admin dashboard time-series ---------------------------------------------

export async function getJobsByDay(days = 7): Promise<JobsByDayPoint[]> {
  const rows = await query<{ day: string; status: string; job_count: string }>(
    `select
       to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
       status,
       count(*)::int as job_count
     from jobs
     where created_at >= now() - ($1 || ' days')::interval
     group by 1, 2
     order by 1 asc`,
    [days]
  );

  // Pivot: group by day, summing per status
  const map = new Map<string, JobsByDayPoint>();
  for (const r of rows) {
    if (!map.has(r.day)) map.set(r.day, { day: r.day, done: 0, failed: 0, total: 0 });
    const pt = map.get(r.day)!;
    const n = Number(r.job_count);
    pt.total += n;
    if (r.status === "done") pt.done += n;
    if (r.status === "failed" || r.status === "rejected") pt.failed += n;
  }
  return Array.from(map.values());
}

export async function getReviewQueueDepth(): Promise<number> {
  const row = await one<{ n: string }>(
    `select count(*)::int as n from review_queue where resolved = false`
  );
  return Number(row?.n ?? 0);
}

// ---- admin dashboard aggregates ----------------------------------------------
// All read-only, gated behind requireAdmin() at the page/action level. Each is a single
// scan over small tables; fine for the current scale (add materialization later if needed).

export interface AdminStats {
  jobsByStatus: { status: string; count: number }[];
  funnel: { signups: number; paid: number; delivered: number };
  feedback: { up: number; down: number; reportUp: number; reportDown: number };
  recent: { id: string; status: string; stage: string | null; created_at: string; genre: string | null }[];
}

export async function getAdminStats(): Promise<AdminStats> {
  const [jobsByStatus, signups, purchasers, subscribers, delivered, fb, recent] = await Promise.all([
    query<{ status: string; count: string }>(
      `select status, count(*)::int as count from jobs group by status order by count(*) desc`
    ),
    one<{ n: string }>(`select count(*)::int as n from users`),
    // distinct users who ever bought a Summit credit (one-time purchase)
    one<{ n: string }>(
      `select count(distinct user_id)::int as n from credit_ledger where reason = 'purchase'`
    ),
    // distinct users with an active/trialing subscription
    one<{ n: string }>(
      `select count(*)::int as n from subscriptions where status in ('active','trialing')`
    ),
    one<{ n: string }>(`select count(*)::int as n from results`),
    one<{ up: string; down: string; report_up: string; report_down: string }>(
      `select
         count(*) filter (where target = 'fix' and vote = 'up')::int as up,
         count(*) filter (where target = 'fix' and vote = 'down')::int as down,
         count(*) filter (where target = 'report' and vote = 'up')::int as report_up,
         count(*) filter (where target = 'report' and vote = 'down')::int as report_down
       from feedback`
    ),
    query<{ id: string; status: string; stage: string | null; created_at: string; genre: string | null }>(
      `select j.id, j.status, j.stage, j.created_at, s.genre
         from jobs j left join songs s on s.id = j.song_id
        order by j.created_at desc limit 12`
    ),
  ]);

  return {
    jobsByStatus: jobsByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    funnel: {
      signups: Number(signups?.n ?? 0),
      // paid = anyone who bought a credit OR holds a subscription
      paid: Number(purchasers?.n ?? 0) + Number(subscribers?.n ?? 0),
      delivered: Number(delivered?.n ?? 0),
    },
    feedback: {
      up: Number(fb?.up ?? 0),
      down: Number(fb?.down ?? 0),
      reportUp: Number(fb?.report_up ?? 0),
      reportDown: Number(fb?.report_down ?? 0),
    },
    recent,
  };
}
