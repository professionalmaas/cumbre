// Single source of truth for the local-dev harness flag.
//
// When DEV_MODE=1 the ENTIRE user loop (sign up → entitlement → upload → analyzing →
// report) runs on localhost with no AWS: Docker Postgres, a stub dev user, local file
// storage, and the Python worker invoked inline instead of Step Functions. Everything in
// the codebase that touches AWS is gated on this flag — when it is unset the production
// AWS code paths are 100% untouched.
//
// See dev/README.md and docs/LOCAL_DEV.md for the one-command-ish run path.
export const DEV_MODE = process.env.DEV_MODE === "1";

// Stable stub identity used by the dev-auth path (lib/auth/session.ts). The row is still
// provisioned by ensureUser() so the credit ledger / entitlement work exactly as in prod.
export const DEV_USER = { sub: "dev-user", email: "dev@cumbre.local" } as const;
