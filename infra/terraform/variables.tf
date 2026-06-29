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
  default     = "cumbre.certuspest.com"
  description = "Hostname that routes to Cumbre via the shared ALB"
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
  default     = "certus-terraform-state-ACCOUNT_ID_PLACEHOLDER"
  description = "S3 bucket holding the shared layer Terraform state"
}

variable "shared_state_key" {
  type        = string
  default     = "shared/prd/terraform.tfstate"
  description = "Object key for the shared layer state file"
}

# ── Cognito pool domain ───────────────────────────────────────────────────────
variable "cognito_domain_prefix" {
  type        = string
  default     = "certus-cumbre-prd"
  description = "Cognito hosted-UI domain prefix (must be globally unique; adjust if taken)"
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
  type      = string
  sensitive = true
}

variable "stripe_webhook_secret" {
  type      = string
  sensitive = true
}

variable "stripe_price_summit" {
  type        = string
  sensitive   = true
  description = "Stripe price ID for the Summit pass (pay-per-song)"
}

variable "stripe_price_season" {
  type        = string
  sensitive   = true
  description = "Stripe price ID for the Season pass (subscription credits)"
}

variable "openai_api_key" {
  type      = string
  sensitive = true
}

variable "anthropic_api_key" {
  type        = string
  sensitive   = true
  description = "Anthropic API key for the Claude Haiku A&R worker layer"
}

variable "acrcloud_host" {
  type = string
}

variable "acrcloud_access_key" {
  type      = string
  sensitive = true
}

variable "acrcloud_access_secret" {
  type      = string
  sensitive = true
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
