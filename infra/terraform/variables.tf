# ── Core ──────────────────────────────────────────────────────────────────────
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "prd"
}

variable "host_header" {
  type        = string
  default     = "cumbre.hub.local"
  description = "Hostname that routes to Cumbre via the shared ALB. Placeholder until a real domain is registered; override in tfvars."
}

variable "github_repo" {
  type        = string
  default     = "professionalmaas/cumbre"
  description = "owner/repo used to scope the GitHub OIDC deploy role"
}

variable "github_environment" {
  type    = string
  default = "prd"
}

variable "admin_email" {
  type        = string
  description = "Email for budget alerts and Cognito admin notifications"
}

variable "monthly_budget_usd" {
  type    = number
  default = 200
}

# ── Shared remote state ────────────────────────────────────────────────────────
variable "shared_state_bucket" {
  type        = string
  default     = "hub-terraform-state-110844251073"
  description = "S3 bucket holding the shared layer Terraform state"
}

variable "shared_state_key" {
  type        = string
  default     = "hub-prd/shared/terraform.tfstate"
  description = "Object key for the shared layer state file — must match the key used when the shared layer was init-ed"
}

# ── Cognito pool domain ───────────────────────────────────────────────────────
variable "cognito_domain_prefix" {
  type        = string
  default     = "hub-cumbre-prd"
  description = "Cognito hosted-UI domain prefix (must be globally unique across ALL AWS accounts; if 'hub-cumbre-prd' is already taken, append a short suffix e.g. 'hub-cumbre-prd-1')"
}

variable "google_client_id" {
  type        = string
  default     = ""
  description = "Google OAuth client ID for Sign in with Google (from Google Cloud Console). Empty = Google IdP not created."
}

variable "google_client_secret" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Google OAuth client secret. Empty = Google IdP not created."
}

# ── App secrets (sensitive — provide via tfvars or environment variables) ──────
# These map directly to the Secrets Manager secret and ECS task environment.
variable "database_url" {
  type        = string
  sensitive   = true
  description = "postgres://user:pass@host:5432/cumbre — auto-built from RDS once the instance is up"
  default     = ""
}

variable "cognito_client_secret" {
  type        = string
  sensitive   = true
  description = "Cognito app client secret — populated by Terraform from the resource, leave blank here"
  default     = ""
}

variable "session_secret" {
  type        = string
  sensitive   = true
  description = "Random string (32+ chars) used to sign the app session JWT cookie"
}

variable "stripe_secret_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Stripe secret key (sk_live_* / sk_test_*). Empty = soft launch; Stripe webhook is inert until provided and redeployed."
}

variable "stripe_webhook_secret" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Filled post-deploy: create the live webhook at <app>/api/stripe/webhook, then put its whsec_ here and redeploy."
}

variable "stripe_price_summit" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Optional: Summit price ID for the Checkout-Sessions fallback. Not needed when the hosted Payment Link (NEXT_PUBLIC_STRIPE_SUMMIT_URL) is used."
}

variable "stripe_price_season" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Optional: Season price ID for the Checkout-Sessions fallback. Not needed when the hosted Payment Link (NEXT_PUBLIC_STRIPE_SEASON_URL) is used."
}

variable "openai_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Optional (soft launch). Blank => no text moderation / ASR; moderate step is pass-through in Phase 1."
}

variable "anthropic_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Optional. Anthropic key for the Claude Haiku A&R layer; blank => deterministic heuristic A&R fallback."
}

variable "acrcloud_host" {
  type        = string
  default     = ""
  description = "Optional (soft launch). Blank => copyright fingerprint skipped (acr returns Allow + acrcloud_not_configured)."
}

variable "acrcloud_access_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "acrcloud_access_secret" {
  type      = string
  sensitive = true
  default   = ""
}

# ── Non-secret app config ─────────────────────────────────────────────────────
variable "admin_emails" {
  type        = string
  default     = ""
  description = "Comma-separated emails allowed into /admin/review"
}

variable "kill_switch_scoring" {
  type    = string
  default = "off"
}

variable "low_confidence_threshold" {
  type    = string
  default = "0.7"
}

# ── RDS ───────────────────────────────────────────────────────────────────────
variable "db_master_username" {
  type    = string
  default = "cumbre"
}

variable "route53_zone_id" {
  type    = string
  default = ""
}
