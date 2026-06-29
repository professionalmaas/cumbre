import { Pool, type PoolClient } from "pg";

// Shared pg pool for the step Lambdas. DATABASE_URL injected from Secrets Manager.
// One pool per warm container; Lambda concurrency is bounded by the function config.
let _pool: Pool | null = null;
function pool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    _pool = new Pool({
      connectionString,
      max: 2,
      ssl: process.env.PGSSL_DISABLE === "1" ? undefined : { rejectUnauthorized: false },
    });
  }
  return _pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool().query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export async function setJob(
  jobId: string,
  patch: { status?: string; stage?: string; flagged_reason?: string; confidence?: number; model_version?: string | null }
): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (!cols.length) return;
  vals.push(jobId);
  await query(`update jobs set ${cols.join(", ")} where id = $${i}`, vals);
}
