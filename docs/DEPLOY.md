# Cumbre — the few steps to deploy

Everything is built and the web app is verified locally (typecheck + production build + live render
of the entry and report screens). What's left is **your inputs** — accounts, keys, and the trained
model. Full mechanics are in `docs/AWS_RUNBOOK.md`; this is the short list.

## What you provide (one-time)
1. **AWS** — your own account, an S3 state bucket, and a certificate on your load balancer. This repo does not ship credentials, and the GitHub workflows do not deploy.
2. **Stripe** — create two prices and copy their ids:
   - **Summit Pass** — one-time, $9 → `STRIPE_PRICE_SUMMIT`
   - **Season Pass** — recurring, $19/mo → `STRIPE_PRICE_SEASON`
   - a webhook endpoint → `STRIPE_WEBHOOK_SECRET`, and your `STRIPE_SECRET_KEY`.
3. **Anthropic** — an API key for the A&R layer → `ANTHROPIC_API_KEY`.
4. **OpenAI** — key (lyrics transcription, Phase 2) → `OPENAI_API_KEY`.
5. **ACRCloud** — host/key/secret for the copyright gate (optional in dev; absent ⇒ "Allow").
6. **The ML model** — see "Model prep" below.

## Deploy (the actual steps)
1. `cd web && npm install && npm run build` · `cd steps && npm install && npm run build`  (already green here).
2. Fill `infra/terraform/terraform.tfvars` (copy the `.example`) with the keys above + a
   `session_secret` (`openssl rand -base64 32`).
3. `cd infra/terraform && terraform init -backend-config=...` → **two-pass** `terraform apply`
   (the RDS security-group rule depends on the module's ECS SG — apply `-target=module.app` first).
4. Apply the DB schema to RDS, in order: **`db/001_schema.sql`** then **`db/002_subscriptions.sql`**.
5. Create the GitHub **`prd` Environment** + the `AWS_DEPLOY_ROLE_ARN` / `AWS_TERRAFORM_ROLE_ARN`
   secrets from `terraform output`. Run **`deploy.yml`** (builds + pushes the web and worker images).
6. **Upload the model** `CUMBRE_fameblind_model.pkl` to the artifacts bucket (`CUMBRE_MODEL_S3`).
7. Smoke-test `https://<host>/api/health`, then sign up → pay → upload a track you own → report.

That's it. The kill switch (`KILL_SWITCH_SCORING=on`) and the AUTO/review band
(`LOW_CONFIDENCE_THRESHOLD`) are env knobs you can flip without a redeploy.

## Model prep (the final piece you flagged)
The rich report is produced by three layers; only the **fame-blind model** is an offline artifact:
- **Audio features + music/lyrics scores** — the in-house engine (`ml/`), already tested.
- **Structure energy + best-moment highlight** — librosa MIR in `worker/cumbre_report.py`.
- **Verdict, market-fit, readiness, comparables, keep, fixes-with-impact** — **the A&R model**
  in `worker/cumbre_report.py` (needs `ANTHROPIC_API_KEY`; falls back to a deterministic heuristic
  if the key is absent, so the report never fails).
- **Internal fame-blind hit score** (`CUMBRE_fameblind_model.pkl`) — secondary/internal only.

So "prep the model" = train + upload the `.pkl`; the rest of the report does **not** depend on it:
```bash
cd ml
python train_fameblind.py spotify_12m.csv spotify_data.csv \
       --hf maharshipandya/spotify-tracks-dataset --model rf --out CUMBRE_fameblind_model.pkl
python refit_model.py --selftest      # prove the refit pipeline
# then upload CUMBRE_fameblind_model.pkl to the artifacts bucket (step 6 above)
```
If you launch **without** the `.pkl`, the worker simply skips the internal hit score — the full
user-facing report (gauge, fixes, mix, comparables, highlight) still renders.

## Before public launch (don't skip)
- The public previews are the original clips `web/public/samples/ridge.wav` and `lantern.wav`.
  Do not commit commercial recordings over them.
- Register a **DMCA agent**, publish ToS/Privacy with the "audio never stored" guarantee (it's real —
  the deliver Lambda deletes the S3 object and the bucket has a 1-day lifecycle backstop).
- Run `/deploy-ready` (the PRR) — the platform already gives circuit-breaker rollback, smoke test,
  graceful shutdown, dashboard, and the per-app budget hard-stop.
