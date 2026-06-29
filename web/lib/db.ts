import { Pool, type PoolClient } from "pg";
import { DEV_MODE } from "@/lib/devMode";

// Single pooled pg connection to RDS. DATABASE_URL comes from Secrets Manager (injected
// as an env var by the ECS task). RDS is private; TLS is required in prod.
let _pool: Pool | null = null;

export function pool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // Local Docker Postgres speaks no TLS, so DEV_MODE (or the explicit PGSSL_DISABLE=1
    // escape hatch) turns SSL off. Prod keeps encrypt-in-transit (RDS) unchanged.
    const noTls = DEV_MODE || process.env.PGSSL_DISABLE === "1";
    _pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      // RDS uses an AWS-managed cert chain; verify-full needs the RDS CA bundle.
      // Phase 1: encrypt in transit without pinning the CA (private subnet, SG-restricted).
      ssl: noTls ? undefined : { rejectUnauthorized: false },
    });
  }
  return _pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Run a function inside a transaction.
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
