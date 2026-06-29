// Single source of truth for the local-dev harness flag.
//
// When DEV_MODE=1 the ENTIRE user loop (sign up → entitlement → upload → analyzing →
// report) runs on localhost with no AWS: Docker Postgres, a stub dev user, local file
// storage, and the Python worker invoked inline instead of Step Functions. Everything in
// the codebase that touches AWS is gated on this flag — when it is unset the production
// AWS code paths are 100% untouched.
//
// See dev/README.md and docs/LOCAL_DEV.md for the one-command-ish run path.
//
// MONEY-LEAK GUARD: DEV_MODE must NEVER be on in production. The dev path stubs auth,
// skips AWS, and (critically) runs analyses without charging credits — so if DEV_MODE
// leaked into a deployed environment it would hand out free, uncharged analyses. We
// therefore force it OFF whenever the app is actually running in prod, regardless of the
// DEV_MODE env var: when NODE_ENV is "production", or when we detect an ECS/Fargate
// runtime (AWS_EXECUTION_ENV or the ECS container-metadata endpoint). DEV_MODE only ever
// resolves true on a local dev machine that has explicitly set DEV_MODE=1.
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" ||
  !!process.env.AWS_EXECUTION_ENV ||
  !!process.env.ECS_CONTAINER_METADATA_URI_V4;

export const DEV_MODE = !IS_PRODUCTION_RUNTIME && process.env.DEV_MODE === "1";

// Stable stub identity used by the dev-auth path (lib/auth/session.ts). The row is still
// provisioned by ensureUser() so the credit ledger / entitlement work exactly as in prod.
export const DEV_USER = { sub: "dev-user", email: "dev@cumbre.local" } as const;
