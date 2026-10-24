# ── CI/CD roles (from module) ─────────────────────────────────────────────────
output "github_deploy_role_arn" {
  description = "ARN of the GitHub OIDC deploy role — set as AWS_DEPLOY_ROLE_ARN in the GitHub prd Environment"
  value       = module.app.github_deploy_role_arn
}

output "github_terraform_role_arn" {
  description = "ARN of the GitHub OIDC Terraform role — set as AWS_TERRAFORM_ROLE_ARN in the GitHub prd Environment"
  value       = module.app.github_terraform_role_arn
}

# ── App ECR ───────────────────────────────────────────────────────────────────
output "app_ecr_url" {
  description = "Web app ECR repository URL"
  value       = module.app.ecr_repository_url
}

# ── Worker ECR ────────────────────────────────────────────────────────────────
output "worker_ecr_url" {
  description = "Worker ECR repository URL — push hub-cumbre-prd-worker images here"
  value       = aws_ecr_repository.worker.repository_url
}

# ── Cognito ───────────────────────────────────────────────────────────────────
output "cognito_user_pool_id" {
  description = "Cumbre Cognito user pool ID"
  value       = aws_cognito_user_pool.cumbre.id
}

output "cognito_client_id" {
  description = "Cumbre Cognito app client ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  description = "Cumbre Cognito hosted-UI domain prefix"
  value       = aws_cognito_user_pool_domain.cumbre.domain
}

output "cognito_issuer_url" {
  description = "COGNITO_ISSUER value for the web app"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.cumbre.id}"
}

# ── RDS ───────────────────────────────────────────────────────────────────────
output "db_endpoint" {
  description = "RDS Postgres endpoint (host:port)"
  value       = aws_db_instance.cumbre.endpoint
  sensitive   = true
}

# ── S3 ────────────────────────────────────────────────────────────────────────
output "uploads_bucket" {
  description = "S3 bucket for transient audio uploads"
  value       = aws_s3_bucket.uploads.id
}

output "artifacts_bucket" {
  description = "S3 bucket for ML model artifacts — upload CUMBRE_fameblind_model.pkl here"
  value       = aws_s3_bucket.artifacts.id
}

# ── Step Functions ────────────────────────────────────────────────────────────
output "state_machine_arn" {
  description = "ARN of the hub-cumbre-prd-analyze state machine"
  value       = aws_sfn_state_machine.analyze.arn
}
