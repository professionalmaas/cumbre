# Cumbre on AWS — architecture & contract

This is the source of truth for the **AWS-native** build (re-platformed from the spec's
Supabase/Inngest/Modal stack). The shared platform it sits on is not included in this repo.
(`infra/terraform/shared` + `modules/app`). The product behavior is unchanged — only the
infrastructure is AWS-native.

## Service mapping (what replaced what)
| Spec stack | AWS-native | Why |
|---|---|---|
| Vercel | **ECS Fargate** behind the shared **ALB** (`app` module, `enable_auth=false`) | Cumbre is public; auth is in-app, not ALB-gated |
| Supabase Auth | **Dedicated Cognito user pool** (self-signup, Lite tier) | Shared pool is admin-invite-only, TOTP-forced, PLUS tier (per-MAU) — wrong for consumer signup |
| Supabase Postgres + RLS | **RDS Postgres** + app-level authz on Cognito `sub` | No `auth.uid()`; the app scopes every query by the session subject |
| Supabase Storage | **S3** (presigned PUT/GET, delete-after-analyze) | — |
| Inngest | **Step Functions Standard** + Lambda steps + Fargate worker | Durable, retries, DLQ, human-gate via task token |
| Modal | **Fargate RunTask** (`.waitForTaskToken`) wrapping `ml/` | Returns the engine report into the state machine |
| Stripe / ACRCloud / OpenAI | unchanged | No AWS equivalent |

## Why a dedicated Cognito pool (decision record)
The shared pool (`infra/terraform/shared/cognito.tf`) is `allow_admin_create_user_only = true`,
MFA `ON` (TOTP enforced), `user_pool_tier = "PLUS"` (bills per monthly active user). That is an
**internal/admin** identity model. Cumbre needs open **self-service signup** for many free-tier
artists. Putting consumers in that pool is both a UX mismatch (forced TOTP, no self-signup) and a
cost problem (PLUS per-MAU). So Cumbre provisions **its own** Cognito pool (self-signup, email
verification, optional MFA, Lite tier) in the app Terraform. The shared platform still provides
hosting, ALB, Secrets Manager, CI/CD, monitoring, and the budget hard-stop. The **admin review
console** is gated by an email allowlist (`ADMIN_EMAILS`), not by a Cognito group.

## Naming (team=`certus`, app=`cumbre`, env=`prd`) → prefix `certus-cumbre-prd`
| Resource | Name |
|---|---|
| ECR / ECS service / TG / dashboard (module) | `certus-cumbre-prd` |
| RDS Postgres instance | `certus-cumbre-prd-db` |
| S3 upload bucket | `certus-cumbre-prd-uploads-<acct>` |
| S3 model/artifacts bucket | `certus-cumbre-prd-artifacts-<acct>` |
| Cognito user pool | `certus-cumbre-prd-users` |
| Step Functions state machine | `certus-cumbre-prd-analyze` |
| Worker ECS task definition | `certus-cumbre-prd-worker` |
| Step Lambdas | `certus-cumbre-prd-<step>` (validate, moderate, fingerprint, charge, deliver, reject, review) |

## Web container env contract
**Non-secret** (`app_env_vars` in Terraform; module also injects `AWS_REGION`, `ALB_ARN`, `PORT`, `HOSTNAME`):
```
NEXT_PUBLIC_APP_URL=https://cumbre.<domain>
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...
COGNITO_DOMAIN=...                 # hosted-UI domain prefix
COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<poolId>
S3_UPLOAD_BUCKET=certus-cumbre-prd-uploads-<acct>
ANALYZE_STATE_MACHINE_ARN=arn:aws:states:...:stateMachine:certus-cumbre-prd-analyze
ADMIN_EMAILS=you@company.com
KILL_SWITCH_SCORING=off
LOW_CONFIDENCE_THRESHOLD=0.7
```
**Secrets** (`app_secrets` → Secrets Manager `certus-cumbre-prd/secrets`, injected as env at task start):
```
DATABASE_URL=postgres://...        # RDS
COGNITO_CLIENT_SECRET=...
SESSION_SECRET=...                 # signs the app session cookie (JWT)
STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_PRICE_SINGLE=... STRIPE_PRICE_CREDITS_PACK=... STRIPE_PRICE_PACK20=...
OPENAI_API_KEY=...
ACRCLOUD_HOST=... ACRCLOUD_ACCESS_KEY=... ACRCLOUD_ACCESS_SECRET=...
```

The web task role additionally needs: `s3:PutObject/GetObject/DeleteObject` on the uploads bucket,
`states:StartExecution` on the state machine. (Granted in app Terraform, not the base module.)

## Auth flow (in-app Cognito OIDC, Authorization Code)
1. `/login` → 302 to Cognito hosted UI (`/oauth2/authorize`, scope `openid email`, PKCE). Sign-up
   link is on the hosted UI (self-service).
2. `/auth/callback?code=...` → server exchanges code at `/oauth2/token` (client secret), receives
   id/access tokens.
3. Verify the **ID token** with `jose` against the pool JWKS: signature, `iss == COGNITO_ISSUER`,
   `aud == COGNITO_CLIENT_ID`, `exp`. Fail closed.
4. Mint an app **session cookie** = signed JWT (`SESSION_SECRET`, httpOnly, secure, SameSite=Lax)
   carrying `{ sub, email }`. `getUser()` reads + verifies it.
5. On first authenticated request, `ensureUser(sub, email)` upserts the `users` row and, **only if
   newly created**, writes the free-credit `grant` ledger row (in one transaction → idempotent).

## Data flow
upload (browser → **S3 presigned PUT**) → app action inserts `songs` + `jobs(queued)` and calls
**StartExecution** on the `analyze` state machine with `{ jobId, userId, songId, genre, year, s3Key }`
→ state machine:

```
Validate(λ) → ok? ─no→ Reject(λ)               # job=rejected
  └yes→ Moderate(λ) → block→Reject ; review→Review(λ,"moderation")   # job=needs_review (terminal P1)
     └ pass→ Fingerprint(λ) → BlockAccess→Review(λ,"copyright")
        └ Allow→ Worker(ECS runTask.waitForTaskToken)   # returns full report+confidence
           └ ok? ─no→ Review(λ,"ood")
              └yes→ Confidence < threshold ? ─yes→ Review(λ,"low_confidence")
                 └no→ KillSwitch on ? ─yes→ Review(λ,"drift")
                    └no→ Charge(λ, idempotent -1)        # only after success
                       └→ Deliver(λ): write results, job=done, DELETE S3 audio
```

The worker is the only `waitForTaskToken` step: Step Functions passes the task token in the ECS
container override env `TASK_TOKEN`; the worker computes the report and calls
`SendTaskSuccess({ taskToken, output })` (or `SendTaskFailure`). Heavy ML stays off the web task.

## Lambda steps (Node 20, shared `steps/` codebase, in-VPC for RDS)
Each handler gets the state input, does its job against RDS/S3/secrets, returns a small JSON the
ASL branches on. They reuse the same query layer as the web app (`lib/db`, `lib/aws/s3`).
`charge` is idempotent (unique index on `credit_ledger(job_id) where reason='analysis'`).
`deliver` writes `results`, sets `jobs.done`, and deletes the S3 object.

## Worker container (`worker/Dockerfile`, Python)
Wraps `ml/cumbre_scoring.analyze_song` + loads `CUMBRE_fameblind_model.pkl` from the artifacts
bucket (`CUMBRE_MODEL_S3`). Entry `worker/aws_entry.py`: reads `{ s3Key, genre, year, TASK_TOKEN }`
from env, downloads audio from S3, runs the engine + model, calls `SendTaskSuccess`. Same
`extract_and_score` logic as `worker/modal_app.py` (kept for the non-AWS path).

## What's deliberately deferred (Phase 2+, same as the Supabase build)
- Lyrics (Demucs/Whisper) + Hip-hop; real text moderation (no lyrics stored in P1).
- "Approve → resume" from the review queue via a second task token (P1 review states are terminal;
  admin reject/refund/dismiss only).
- Aurora Serverless v2 instead of single-AZ RDS (cost vs HA); Route53 + ACM custom domain.
