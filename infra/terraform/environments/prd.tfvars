# certus-cumbre-prd — production tfvars
# Copy this to terraform.tfvars and fill in EVERY value marked REQUIRED.
# Never commit real secrets to git.

aws_region  = "us-east-1"
environment = "prd"

# ── Routing ───────────────────────────────────────────────────────────────────
host_header = "cumbre.certuspest.com"

# ── GitHub ────────────────────────────────────────────────────────────────────
github_repo        = "professionalmaas/cumbre"
github_environment = "prd"

# ── Admin ─────────────────────────────────────────────────────────────────────
admin_email        = "REQUIRED — your-email@certuspest.com"
monthly_budget_usd = 200

# ── Shared remote state ────────────────────────────────────────────────────────
# Replace ACCOUNT_ID_PLACEHOLDER with your 12-digit AWS account ID.
shared_state_bucket = "hub-terraform-state-110844251073"
shared_state_key    = "hub-prd/shared/terraform.tfstate"

# ── Cognito ───────────────────────────────────────────────────────────────────
# Must be globally unique. If "certus-cumbre-prd" is taken, add a suffix.
cognito_domain_prefix = "certus-cumbre-prd"

# ── Route53 (optional — leave "" if managing DNS manually) ───────────────────
route53_zone_id = ""

# ── App config (non-secret) ───────────────────────────────────────────────────
admin_emails             = "REQUIRED — comma-separated admin email(s)"
kill_switch_scoring      = "off"
low_confidence_threshold = "0.0"

# ── Database ──────────────────────────────────────────────────────────────────
db_master_username = "cumbre"

# ── Stripe pass price IDs ─────────────────────────────────────────────────────
stripe_price_summit = "REQUIRED — price_XXXX" # Summit pass (pay-per-song)
stripe_price_season = "REQUIRED — price_XXXX" # Season pass (subscription credits)

# ── ACRCloud ─────────────────────────────────────────────────────────────────
acrcloud_host = "REQUIRED — identify-eu-west-1.acrcloud.com"

# ─────────────────────────────────────────────────────────────────────────────
# SECRETS — provide via environment variables or a secrets-only tfvars file
# that is NOT committed to git (add to .gitignore).
# Example: TF_VAR_session_secret="..." terraform apply
# ─────────────────────────────────────────────────────────────────────────────
# session_secret          = "REQUIRED — 32+ random chars"
# stripe_secret_key       = "REQUIRED — sk_live_..."
# stripe_webhook_secret   = "REQUIRED — whsec_..."
# openai_api_key          = "REQUIRED — sk-..."
# anthropic_api_key       = "REQUIRED — sk-ant-..."
# acrcloud_access_key     = "REQUIRED"
# acrcloud_access_secret  = "REQUIRED"
