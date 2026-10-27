# Cumbre — sunset (2026-10-27) and how to bring it back without starting from zero

Cumbre was archived on 2026-07-02 (app layer torn down, platform kept). On 2026-10-27 the
owner decided to **sunset the shared hub platform too**: it was running nothing
(`hub-cumbre-prd` desired count 0, ALB 443 default = fixed-response) and still billing
≈ $60/mo (NAT $32, ALB $16, WAF ~$7, SES managed dedicated IP $15 in us-east-2, public IPv4).
This file is the contract that makes the sunset reversible.

## What is KEPT (the resurrection kit) — do not delete
| Asset | Where | Why it matters |
|---|---|---|
| Source, at the archived tip | GitHub `professionalmaas/cumbre` tag **`archive/2026-07-02`**; local `C:\Users\ob1_k\Projects\cumbre` (PRD tip `6172383`, clean) | ECR repos are **EMPTY** (0 images) — images are rebuilt from source |
| Database | RDS snapshots **`cumbre-archive-2026-07-02`** and `hub-cumbre-prd-db-final` (postgres 16.13, 20 GB, encrypted) | All migrations 001–006 are applied inside the snapshot |
| **KMS key `alias/hub-prd-secrets`** (`e8b3b542-…`) | shared stack — **must survive the destroy** | The RDS snapshots are encrypted with it; delete the key = snapshots unrestorable |
| KMS key `alias/hub-prd-logs` | shared stack — keep | CloudTrail/Config history |
| Terraform state (both layers), **versioned** | `s3://hub-terraform-state-110844251073/hub-prd/shared/terraform.tfstate` and `/hub-prd/cumbre/terraform.tfstate`; local pulls in `Downloads\rapitin-rollback-2026-10-27\hub-*.tfstate.json` | Every destroy leaves the previous state as a version |
| `terraform.tfvars` (gitignored, local only) | `Downloads\cumbre-archive\terraform.tfvars.backup` | Domain, emails, feature flags, non-secret config |
| Cognito users (no password hashes) | `Downloads\cumbre-archive\cognito-users-2026-07-02.json` | Users re-register / reset; identities re-link by email |
| ML model | `Downloads\cumbre-archive\CUMBRE_fameblind_model.pkl` (931,239 B; identical to `SPOTIFY_best_model_and_metadata.pkl`) | The scoring engine |
| Domain + DNS | `getcumbre.com` (Squarespace registrar renewal) + Route 53 zone `Z08498163MMMGP3OX7UW5` | Keep the zone; only the A/ALIAS record to the ALB disappears |
| Stripe | live account, products kept; payment links deactivated; 0 subscriptions | New payment links on resurrection |
| Audit/log history | S3 `hub-prd-cloudtrail-…` (0.46 GB), `hub-prd-config-…`, `hub-prd-alb-logs-…`, `hub-prd-flow-logs-…` | cheap, versioned, keep |
| Deploy playbook + gotchas | memory `aws-hub-deploy-playbook`, runbooks `/new-hub`, `/archive-app`, brain skills O-17/A-07/A-08/A-09/F-11; this repo's `docs/AWS_RUNBOOK.md`, `docs/DEPLOY.md` | The 17 gotchas that each cost a failed apply |

## What the sunset REMOVES (owner runs; Claude prepared and verified read-only)
Cumbre app layer (`infra/terraform` in this repo, state key `hub-prd/cumbre/…`, 179
resources — Lambdas, Step Functions, RUM, alarms, backup vaults (0 recovery points),
empty S3 uploads/artifacts, the app Cognito pools, ECS service/task defs): **full destroy**.
Shared hub (`Projects/infra/terraform/shared`, state key `hub-prd/shared/…`, 78 resources):
**targeted destroy of the cost-bearing network only** — NAT + EIP, ALB + listeners + SG,
WAF (ACL, association, logging, log group, alarm), ECS cluster, VPC (subnets, route tables,
IGW, S3 endpoint, flow log), hub Cognito pool + domain + admin user, SNS alerts.
**Not destroyed:** the two KMS keys, the four S3 log buckets, CloudTrail, Config, GuardDuty,
Security Hub, Access Analyzer, the IAM password policy, the GitHub OIDC provider, the budget
(account-level security that also covers Rapitín; ≈ $12/mo, owner's call later).
Plus, outside Terraform: the SES **managed dedicated IP pool `cumbre` in us-east-2** ($15/mo)
is deleted (`aws sesv2 delete-dedicated-ip-pool --pool-name cumbre --region us-east-2`); the
`getcumbre.com` SES identity stays (free).

Before each destroy: `terraform state pull > <date>-<layer>.tfstate.json` (local, never
committed), and keep the printed plan. Order: app layer first, then the shared network.

### Sunset commands (plans verified read-only on 2026-10-27 — run off-hours, one layer at a time)
```bash
# 0. traces (already captured once in Downloads\rapitin-rollback-2026-10-27\; repeat before you run)
cd C:\Users\ob1_k\Projects\cumbre\infra\terraform
terraform init -reconfigure -backend-config="bucket=hub-terraform-state-110844251073" -backend-config="key=hub-prd/cumbre/terraform.tfstate"
terraform state pull > C:\Users\ob1_k\Downloads\rapitin-rollback-2026-10-27\hub-cumbre.before-destroy.tfstate.json

# 1. Cumbre app layer — FULL destroy (verified: 0 to add, 0 to change, 122 to destroy; no KMS key, no RDS, no Route 53 zone in the plan)
terraform destroy          # review: the only things with data are two EMPTY S3 buckets; backup vault has 0 recovery points

# 2. Shared hub — TARGETED destroy of the network/ALB/WAF/ECS/Cognito/SNS only
#    (verified: 0 to add, 0 to change, 32 to destroy; KMS keys, the four log buckets, CloudTrail, Config,
#     GuardDuty, Security Hub, Access Analyzer, password policy, GitHub OIDC provider, budget are NOT in the plan)
cd C:\Users\ob1_k\Projects\infra\terraform\shared
terraform init -reconfigure -backend-config="bucket=hub-terraform-state-110844251073" -backend-config="key=hub-prd/shared/terraform.tfstate"
terraform state pull > C:\Users\ob1_k\Downloads\rapitin-rollback-2026-10-27\hub-shared.before-destroy.tfstate.json
terraform destroy -var "cognito_domain_prefix=getcumbre-prd" -var "admin_email=<your admin email>" \
  -target=aws_nat_gateway.main -target=aws_eip.nat \
  -target=aws_lb.main -target=aws_lb_listener.http -target=aws_lb_listener.https \
  -target=aws_security_group.alb -target=aws_security_group.vpc_endpoints \
  -target=aws_wafv2_web_acl.main -target=aws_wafv2_web_acl_association.alb -target=aws_wafv2_web_acl_logging_configuration.main \
  -target=aws_cloudwatch_log_group.waf -target=aws_cloudwatch_metric_alarm.waf_blocks \
  -target=aws_ecs_cluster.main -target=aws_ecs_cluster_capacity_providers.main \
  -target=aws_vpc.main -target=aws_subnet.private -target=aws_subnet.public \
  -target=aws_route_table.private -target=aws_route_table.public \
  -target=aws_route_table_association.private -target=aws_route_table_association.public \
  -target=aws_internet_gateway.main -target=aws_vpc_endpoint.s3 -target=aws_flow_log.main \
  -target=aws_cognito_user_pool.main -target=aws_cognito_user_pool_domain.main -target=aws_cognito_user.admin \
  -target=aws_sns_topic.alerts -target=aws_sns_topic_subscription.email
# The printed plan must say "32 to destroy" and must NOT list aws_kms_key.* or aws_s3_bucket.* — stop if it does.

# 3. Outside Terraform: the $15/mo SES managed dedicated-IP pool in us-east-2 (nothing sends through it)
aws sesv2 delete-dedicated-ip-pool --pool-name cumbre --region us-east-2

# 4. Verify (next day): Cost Explorer "EC2 - Other" drops by ~half, "Elastic Load Balancing" by ~half,
#    SES to ~$0; the two RDS snapshots still list `available`; alias/hub-prd-secrets still Enabled.
```

## How to bring it back (≈ 1–2 h hands-on; ~$60–90/mo once up)
1. **Platform:** `cd Projects/infra/terraform/shared && terraform init -backend-config="bucket=hub-terraform-state-110844251073" -backend-config="key=hub-prd/shared/terraform.tfstate" && terraform apply` — the kept resources (KMS, log buckets, security) are reused; the network/ALB/WAF/Cognito come back. Follow `/new-hub` Phase 1 and the playbook gotchas (ACM cert must be ISSUED before the HTTPS listener; ASCII-only SG descriptions; `terraform validate` first).
2. **App layer:** restore `terraform.tfvars` from `Downloads\cumbre-archive\terraform.tfvars.backup` into `infra/terraform/`; `terraform init -backend-config="bucket=hub-terraform-state-110844251073" -backend-config="key=hub-prd/cumbre/terraform.tfstate" && terraform apply` (`/new-hub` Phase 2). Never `-var-file=environments/*.tfvars` (gotcha 14).
3. **Database:** `aws rds restore-db-instance-from-db-snapshot --db-snapshot-identifier cumbre-archive-2026-07-02 …` into the new subnet group / SG (KMS key is the kept `hub-prd-secrets`); point `DATABASE_URL` (Secrets Manager) at it. Do **not** re-run migrations 001–006 — they are in the snapshot; apply only newer ones in numeric order (gotcha 17).
4. **Images:** rebuild from the `archive/2026-07-02` tag (or the local folder): web + worker + worker-lambda per `docs/DEPLOY.md` / `.github/workflows/deploy.yml`; push to the three ECR repos; force a new ECS deployment; update the worker Lambda image (amd64 digest — gotcha in `cumbre-aws-hub-deploy`).
5. **DNS:** re-create the Route 53 A/ALIAS for `getcumbre.com` → the new ALB (zone kept).
6. **Users:** Cognito pool is new — users reset passwords / re-register; admin email allowlist via `ADMIN_EMAILS`.
7. **Stripe:** new live payment links; re-enable the webhook endpoint with the new URL.
8. **Email:** SES identity `getcumbre.com` is kept; only re-create a dedicated IP pool if deliverability needs it (it did not at this scale).
9. **Verify:** `/check-live` (CSP connect-src includes the uploads bucket; real upload round-trip), then `/go-live` checklist.

## Why this is safe to do now
Nothing in Rapitín depends on the hub: separate VPC, ALB, Cognito pool, WAF, state bucket,
and its own GitHub OIDC deploy role (verified 2026-10-27: no `hub-prd` / remote-state
references in `rapitin-os/deploy` or its workflows).
