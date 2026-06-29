# Cumbre — AWS Launch & Rollback Runbook

Prefix: `certus-cumbre-prd`
Region: `us-east-1`
Shared platform repo: `professionalmaas/home` branch `PRD`

---

## Pre-flight checklist

Before starting, confirm:

- [ ] Shared platform already applied (`infra/terraform/shared/` in `professionalmaas/home`)
- [ ] AWS CLI configured with an admin-equivalent IAM role
- [ ] Terraform >= 1.5 installed (`terraform -version`)
- [ ] Docker installed locally
- [ ] S3 state bucket exists and versioning is enabled (see step 1)
- [ ] Stripe account with price IDs created
- [ ] ACRCloud account with host/key/secret
- [ ] `steps/dist/<name>/index.js` built for all 7 Lambda steps before applying Terraform
- [ ] `CUMBRE_fameblind_model.pkl` available locally to upload post-apply

---

## Step 1 — State bucket (one-time, skip if already done)

```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="certus-terraform-state-${ACCT}"

aws s3 mb "s3://${BUCKET}" --region us-east-1
aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled
```

Note the account ID — replace `ACCOUNT_ID_PLACEHOLDER` in `backend.tf`, `environments/prd.tfvars`,
and `terraform.tfvars.example`.

---

## Step 2 — Confirm shared platform state is accessible

```bash
aws s3 ls "s3://certus-terraform-state-${ACCT}/shared/prd/terraform.tfstate"
# Must exist. If not, apply the shared layer first.
```

---

## Step 3 — Build step Lambda bundles

The 7 step Lambdas (validate, moderate, fingerprint, charge, deliver, reject, review) must
be built before `terraform apply`, because `archive_file` reads `steps/dist/<name>/index.js`.

```bash
cd steps
npm ci
npm run build   # should produce dist/validate/index.js, dist/moderate/index.js, etc.
cd ..
```

If `steps/` does not yet have a package.json, the app developer needs to create the bundles.
Placeholder: you can create empty `steps/dist/<name>/index.js` files to unblock infra apply,
then redeploy once the real code is ready.

---

## Step 4 — Create terraform.tfvars (secrets)

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# Edit terraform.tfvars — fill in every REQUIRED value.
# DO NOT commit terraform.tfvars to git (it contains secrets).
echo "infra/terraform/terraform.tfvars" >> .gitignore
```

Minimum required values with no defaults:
- `admin_email`
- `session_secret` (32+ random chars: `openssl rand -base64 32`)
- `stripe_secret_key`, `stripe_webhook_secret`
- `stripe_price_single`, `stripe_price_credits_pack`, `stripe_price_pack20`
- `openai_api_key`
- `acrcloud_host`, `acrcloud_access_key`, `acrcloud_access_secret`
- `shared_state_bucket` (with real account ID)

---

## Step 5 — Terraform init

```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)

cd infra/terraform

terraform init \
  -backend-config="bucket=certus-terraform-state-${ACCT}" \
  -backend-config="key=cumbre/prd/terraform.tfstate" \
  -backend-config="region=us-east-1"
```

---

## Step 6 — Apply (two-pass for the RDS SG rule chicken-and-egg)

The `aws_security_group_rule.rds_from_web` references `module.app.ecs_task_security_group_id`.
On a clean account, run in two passes:

```bash
# Pass 1: apply the module (creates the ECS SG) and all independent resources
terraform apply -var-file=environments/prd.tfvars -target=module.app

# Pass 2: full apply (resolves the SG rule and all remaining resources)
terraform apply -var-file=environments/prd.tfvars
```

On subsequent applies (not first-time), a single `terraform apply` is fine.

Expected resources created (approximate count: ~65):
- Cognito user pool + domain + client
- RDS Postgres instance + subnet group + security groups
- S3 uploads + artifacts buckets
- 7 Lambda functions + shared IAM role + SG
- Step Functions state machine
- Worker ECR + ECS task definition + IAM roles
- App module: web ECR, ECS service, ALB rule, Secrets Manager, CloudWatch alarms,
  dashboard, budget, GitHub OIDC roles

Note: `aws_db_instance.cumbre` takes 5-10 minutes to provision.

---

## Step 7 — Capture outputs

```bash
terraform output -json > /tmp/cumbre-outputs.json
cat /tmp/cumbre-outputs.json
```

Record:
- `github_deploy_role_arn`
- `github_terraform_role_arn`
- `artifacts_bucket`
- `uploads_bucket`
- `state_machine_arn`
- `cognito_user_pool_id`

---

## Step 7a — Apply DB schema migrations

Run these in order after the RDS instance is up. The database must exist (`cumbre`) and
the master user (`var.db_master_username`, default `cumbre`) must be the connecting user.

```bash
DB_ENDPOINT=$(terraform output -raw db_endpoint)   # host:port
DB_HOST="${DB_ENDPOINT%:*}"
DB_PORT="${DB_ENDPOINT#*:}"

# Set DB password (from the random_password resource in state — or your tfvars)
# export PGPASSWORD="..."

# 1. Core schema: users, songs, jobs, results, credit_ledger, review_queue
psql "postgresql://cumbre:${PGPASSWORD}@${DB_HOST}:${DB_PORT}/cumbre" \
  -f db/001_schema.sql

# 2. Subscriptions table (Season pass / Summit pass billing model)
psql "postgresql://cumbre:${PGPASSWORD}@${DB_HOST}:${DB_PORT}/cumbre" \
  -f db/002_subscriptions.sql
```

Schema highlights in 002_subscriptions.sql (for review before applying):
- `songs` table: `genre` CHECK constraint dropped; new `depth` and `lens` columns added
- `results` table: `report jsonb` column (stores the full A&R worker output)
- New `subscriptions` table: Season pass entitlements and renewal tracking

If psql is not available locally, run via an EC2 bastion or AWS Systems Manager Session
Manager connected to a host in the same VPC. Never route RDS traffic through a public IP.

To get the DB password from Terraform state:
```bash
terraform output -raw db_endpoint   # confirms the endpoint is ready
# Password is in the Secrets Manager secret certus-cumbre-prd/secrets as DATABASE_URL
aws secretsmanager get-secret-value \
  --secret-id certus-cumbre-prd/secrets \
  --query SecretString --output text | python3 -c \
  "import sys,json; u=json.load(sys.stdin)['DATABASE_URL']; print(u)"
```

---

## Step 8 — Create GitHub prd Environment + secrets

In the `professionalmaas/cumbre` GitHub repo:

1. Settings → Environments → New environment → name: `prd`
2. Add environment secrets:
   - `AWS_DEPLOY_ROLE_ARN` = value from `terraform output github_deploy_role_arn`
   - `AWS_TERRAFORM_ROLE_ARN` = value from `terraform output github_terraform_role_arn`

IMPORTANT: The GitHub OIDC trust (in the module) is scoped to `environment:prd` exactly.
The environment name in GitHub MUST match `var.github_environment` (default: `prd`).

---

## Step 9 — Upload the ML model

```bash
ARTIFACTS=$(terraform output -raw artifacts_bucket)

aws s3 cp /path/to/CUMBRE_fameblind_model.pkl \
  "s3://${ARTIFACTS}/CUMBRE_fameblind_model.pkl"
```

The worker reads `CUMBRE_MODEL_S3` (the bucket name) from its environment and downloads
the model on startup. The key is always `CUMBRE_fameblind_model.pkl`.

---

## Step 10 — First deploy (web image)

Trigger `deploy.yml` via GitHub Actions:

```
Actions → Deploy → Run workflow → branch: PRD
```

This builds the Next.js standalone image, pushes to ECR `certus-cumbre-prd`, and deploys
to ECS. The smoke test hits `https://cumbre.certuspest.com/api/health`.

First run: ECR is empty until this workflow completes. The ECS service may show
"unable to pull image" until the first push succeeds — this is normal.

---

## Step 11 — First worker image push

Trigger the `deploy-worker` job (it runs as part of `deploy.yml` on every push to `PRD`).
Alternatively:

```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)
WORKER_ECR="${ACCT}.dkr.ecr.us-east-1.amazonaws.com/certus-cumbre-prd-worker"

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "${ACCT}.dkr.ecr.us-east-1.amazonaws.com"

docker build -f worker/Dockerfile -t "${WORKER_ECR}:latest" .
docker push "${WORKER_ECR}:latest"
```

---

## Step 12 — DNS

If `route53_zone_id` is set in tfvars, Terraform already created the A record.

If managing DNS manually, create a CNAME:
```
cumbre.certuspest.com → <ALB DNS name from terraform output alb_dns_name or shared state>
```

ACM certificate for `cumbre.certuspest.com` must be validated in ACM and attached to
the ALB HTTPS listener (TODO: this is a shared-layer concern — confirm the cert covers
the Cumbre hostname or add a SANs extension).

---

## Step 13 — Smoke test

```bash
curl -I https://cumbre.certuspest.com/api/health
# Expect: HTTP/2 200
```

Also test the auth flow manually:
1. Navigate to `https://cumbre.certuspest.com/login`
2. Should redirect to Cognito hosted UI (`https://certus-cumbre-prd.auth.us-east-1.amazoncognito.com/...`)
3. Sign up with a test email, complete email verification
4. Should redirect back to `/auth/callback` and set session cookie

---

## Step 14 — Run /deploy-ready PRR

Run the prod-launch-auditor checklist:
- Circuit breaker: YES (module sets `deployment_circuit_breaker { enable=true; rollback=true }`)
- Smoke test: YES (health_url set in deploy.yml)
- Graceful shutdown: YES (deregistration_delay=30, stopTimeout=60 in module)
- Health route: YES (`/api/health` must return 200)
- Dashboard: YES (module creates `certus-cumbre-prd` CloudWatch dashboard)
- JSON logs: VERIFY (app must write structured JSON to stdout)
- Pinned base image: VERIFY (`node:20-alpine` — add `--platform linux/amd64` if on M1)
- Secrets in SM only: YES (all secrets in `certus-cumbre-prd/secrets`)

---

## Kill switch — halt scoring without a deploy

The `KILL_SWITCH_SCORING` env var is an ECS environment variable (non-secret).
To flip it without a deploy, update the task definition and force a new deployment:

```bash
# 1. Get current task definition
TASK_DEF=$(aws ecs describe-services \
  --cluster certus-prd \
  --services certus-cumbre-prd \
  --query 'services[0].taskDefinition' \
  --output text)

# 2. Register a new task definition revision with KILL_SWITCH_SCORING=on
# (use the console or a JSON override — fastest path is the console)
# AWS Console → ECS → Task Definitions → certus-cumbre-prd → Create new revision
# → find KILL_SWITCH_SCORING env var → change to "on" → Create

# 3. Update the service to the new revision
aws ecs update-service \
  --cluster certus-prd \
  --service certus-cumbre-prd \
  --task-definition certus-cumbre-prd:<NEW_REVISION> \
  --force-new-deployment
```

State machine executions already in flight when the switch is flipped will still
complete (the Worker step checks the flag from env, not from the state machine).
New StartExecution calls from the web app will skip Charge → route to ReviewDrift.

---

## Audio deletion guarantee

`deliver` Lambda deletes the S3 object (`s3:DeleteObject` on the uploads bucket).
As a belt-and-suspenders backup, the uploads bucket has a 1-day lifecycle rule
(`aws_s3_bucket_lifecycle_configuration.uploads`) that expires any object that
was not explicitly deleted (e.g., if `deliver` failed and the job was rejected
at the review queue).

To verify:
```bash
aws s3api get-bucket-lifecycle-configuration \
  --bucket certus-cumbre-prd-uploads-<ACCT>
```

---

## Rollback — ECS deployment

The ECS circuit breaker auto-rolls back a deploy that fails the ALB health check.
To manually roll back to a specific image:

```bash
# Find the previous image SHA in ECR
aws ecr list-images --repository-name certus-cumbre-prd \
  --query 'imageIds[*].imageTag' --output text

# Retag that SHA as latest
OLD_SHA=abc1234  # previous good SHA
REGISTRY=$(aws ecr describe-repositories \
  --repository-names certus-cumbre-prd \
  --query 'repositories[0].repositoryUri' --output text)

MANIFEST=$(aws ecr batch-get-image \
  --repository-name certus-cumbre-prd \
  --image-ids imageTag=${OLD_SHA} \
  --query 'images[0].imageManifest' --output text)

aws ecr put-image \
  --repository-name certus-cumbre-prd \
  --image-tag latest \
  --image-manifest "${MANIFEST}"

# Force new deployment
aws ecs update-service \
  --cluster certus-prd \
  --service certus-cumbre-prd \
  --force-new-deployment
```

---

## Rollback — Terraform destructive change

The `_terraform-layer.yml` workflow blocks auto-apply when destructive changes are
detected. To apply manually after review:

```bash
cd infra/terraform
terraform init   # (re-init if needed)
terraform plan -var-file=environments/prd.tfvars -out=tfplan
# Review plan carefully
terraform apply tfplan
```

Never force-destroy `aws_db_instance.cumbre` — `deletion_protection = true` blocks it.
To destroy for real: set `deletion_protection = false` in tfvars, apply, then destroy.

---

## Monitoring

CloudWatch dashboard: `certus-cumbre-prd`
- ALB request rate, 5xx count, p95 latency
- ECS CPU/memory
- Running task count (alarm fires if 0)

Step Functions: AWS Console → Step Functions → `certus-cumbre-prd-analyze`
- Execution history, failed executions, task tokens timing out

Lambda metrics: `/aws/lambda/certus-cumbre-prd-<step>` log groups

SNS alerts: `certus-prd-alerts` topic (from shared layer) → your admin email

---

## Common troubleshooting

| Symptom | Check |
|---|---|
| ECS service stuck at 0/1 tasks | ECR image exists? First push done? |
| Health check failing | `/api/health` returns 200? HOSTNAME=0.0.0.0? |
| Cognito redirect loop | `COGNITO_ISSUER` env var correct? Client ID matches? |
| Worker task exits immediately | CloudWatch `/ecs/certus-cumbre-prd-worker` logs; TASK_TOKEN present? |
| Step Lambda timeout | Check RDS SG rules; Lambda VPC config; DB endpoint reachable? |
| Charge Lambda charging twice | Verify unique index on `credit_ledger(job_id)` where reason='analysis' |
| Budget alarm firing | Check AWS Cost Explorer → Group by Tag → Team=certus; scale down or optimize |
