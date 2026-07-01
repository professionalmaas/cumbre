# ═══════════════════════════════════════════════════════════════════════════════
# Cumbre — app-layer Terraform
# team=hub  app=cumbre  env=prd  → prefix: hub-cumbre-prd
# ═══════════════════════════════════════════════════════════════════════════════

locals {
  prefix     = "hub-cumbre-prd"
  aws_region = var.aws_region

  # Shortcut alias for shared state outputs
  s = data.terraform_remote_state.shared.outputs
}

data "aws_caller_identity" "current" {}

# ── Shared layer state ────────────────────────────────────────────────────────
data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
    bucket = var.shared_state_bucket
    key    = var.shared_state_key
    region = var.aws_region
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# (a) Dedicated Cognito user pool — self-service signup, Lite tier
# The shared pool is admin-invite-only + PLUS tier (per-MAU) — wrong for Cumbre.
# See docs/AWS_ARCHITECTURE.md "Why a dedicated Cognito pool".
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_cognito_user_pool" "cumbre" {
  name = "${local.prefix}-users"

  # Self-service signup (artists register themselves)
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]

  # Omit user_pool_tier entirely → Lite tier (no per-MAU PLUS billing)

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = false
    temporary_password_validity_days = 7
  }

  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  # Email: COGNITO_DEFAULT now (unreliable, ~50/day cap). Flip use_ses_email=true (AFTER SES
  # production access is granted) to send via the verified getcumbre.com SES identity.
  email_configuration {
    email_sending_account = var.use_ses_email ? "DEVELOPER" : "COGNITO_DEFAULT"
    source_arn            = var.use_ses_email ? var.ses_identity_arn : null
    from_email_address    = var.use_ses_email ? var.ses_from_email : null
  }

  # Verification message
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Cumbre verification code"
    email_message        = "Your verification code is {####}"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    mutable             = true
    required            = true
    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  # NOTE: this is a single nested block — every trigger the pool uses must be listed here
  # together. Adding a new trigger later means re-stating ALL of them, not just the new one.
  lambda_config {
    pre_sign_up                    = aws_lambda_function.cognito_presignup.arn
    define_auth_challenge          = aws_lambda_function.cognito_define_auth.arn
    create_auth_challenge          = aws_lambda_function.cognito_create_auth.arn
    verify_auth_challenge_response = aws_lambda_function.cognito_verify_auth.arn
  }

  tags = {
    Name = "${local.prefix}-users"
  }
}

resource "aws_cognito_user_pool_domain" "cumbre" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.cumbre.id
}

# ══════════════════════════════════════════════════════════════════════════════
# (a2) Cognito Lambda triggers — account-linking (PreSignUp) + magic-link
# (CUSTOM_AUTH: DefineAuthChallenge, CreateAuthChallenge, VerifyAuthChallengeResponse,
# CustomMessage). One shared IAM role; each trigger is its own Lambda function bundled
# from steps/src/cognito-*.ts by the same esbuild pipeline as the analyze-loop steps.
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_iam_role" "cognito_trigger" {
  name = "${local.prefix}-cognito-trigger"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.prefix}-cognito-trigger" }
}

resource "aws_iam_role_policy" "cognito_trigger_permissions" {
  name = "cognito-trigger-permissions"
  role = aws_iam_role.cognito_trigger.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AccountLinking"
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminLinkProviderForUser",
        ]
        Resource = aws_cognito_user_pool.cumbre.arn
      },
      {
        Sid      = "SecretsForMagicLink"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.prefix}/secrets*"
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.prefix}-cognito-*:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "cognito_presignup" {
  name              = "/aws/lambda/${local.prefix}-cognito-presignup"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-cognito-presignup-logs" }
}

data "archive_file" "cognito_presignup" {
  type        = "zip"
  source_dir  = "${path.root}/../../steps/dist/cognito-presignup"
  output_path = "${path.root}/../../steps/dist/cognito-presignup.zip"
}

resource "aws_lambda_function" "cognito_presignup" {
  function_name    = "${local.prefix}-cognito-presignup"
  role             = aws_iam_role.cognito_trigger.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.cognito_presignup.output_path
  source_code_hash = data.archive_file.cognito_presignup.output_base64sha256

  timeout     = 10
  memory_size = 256

  # No env vars needed: Lambda auto-populates AWS_REGION (a reserved name — cannot be
  # overridden), which is all this handler reads.

  depends_on = [aws_cloudwatch_log_group.cognito_presignup]

  tags = { Name = "${local.prefix}-cognito-presignup" }
}

# Cognito must be explicitly granted invoke permission — it is not covered by the pool's
# own IAM identity, this is a resource-based Lambda permission.
resource "aws_lambda_permission" "cognito_presignup" {
  statement_id  = "AllowCognitoInvokePreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_presignup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.cumbre.arn
}

# SES send permission for the magic-link email (CreateAuthChallenge calls SES directly —
# Cognito's CustomMessage trigger does not fire for CUSTOM_CHALLENGE, only for its own
# built-in MFA code delivery).
resource "aws_iam_role_policy" "cognito_trigger_ses" {
  name = "cognito-trigger-ses-send"
  role = aws_iam_role.cognito_trigger.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SendMagicLinkEmail"
      Effect   = "Allow"
      Action   = ["ses:SendEmail"]
      Resource = "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:identity/${var.host_header}"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cognito_trigger_vpc" {
  role       = aws_iam_role.cognito_trigger.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_cloudwatch_log_group" "cognito_define_auth" {
  name              = "/aws/lambda/${local.prefix}-cognito-define-auth"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-cognito-define-auth-logs" }
}

data "archive_file" "cognito_define_auth" {
  type        = "zip"
  source_dir  = "${path.root}/../../steps/dist/cognito-define-auth"
  output_path = "${path.root}/../../steps/dist/cognito-define-auth.zip"
}

resource "aws_lambda_function" "cognito_define_auth" {
  function_name    = "${local.prefix}-cognito-define-auth"
  role             = aws_iam_role.cognito_trigger.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.cognito_define_auth.output_path
  source_code_hash = data.archive_file.cognito_define_auth.output_base64sha256
  timeout          = 10
  memory_size      = 256
  depends_on       = [aws_cloudwatch_log_group.cognito_define_auth]
  tags             = { Name = "${local.prefix}-cognito-define-auth" }
}

resource "aws_lambda_permission" "cognito_define_auth" {
  statement_id  = "AllowCognitoInvokeDefineAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_define_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.cumbre.arn
}

resource "aws_cloudwatch_log_group" "cognito_create_auth" {
  name              = "/aws/lambda/${local.prefix}-cognito-create-auth"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-cognito-create-auth-logs" }
}

data "archive_file" "cognito_create_auth" {
  type        = "zip"
  source_dir  = "${path.root}/../../steps/dist/cognito-create-auth"
  output_path = "${path.root}/../../steps/dist/cognito-create-auth.zip"
}

resource "aws_lambda_function" "cognito_create_auth" {
  function_name    = "${local.prefix}-cognito-create-auth"
  role             = aws_iam_role.cognito_trigger.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.cognito_create_auth.output_path
  source_code_hash = data.archive_file.cognito_create_auth.output_base64sha256
  timeout          = 15
  memory_size      = 256

  vpc_config {
    subnet_ids         = local.s.private_subnet_ids
    security_group_ids = [aws_security_group.ecs_steps.id]
  }

  environment {
    variables = merge(local.step_env, {
      NEXT_PUBLIC_APP_URL   = "https://${var.host_header}"
      MAGIC_LINK_FROM_EMAIL = "no-reply@${var.host_header}"
    })
  }

  depends_on = [aws_cloudwatch_log_group.cognito_create_auth, aws_iam_role_policy_attachment.cognito_trigger_vpc]
  tags       = { Name = "${local.prefix}-cognito-create-auth" }
}

resource "aws_lambda_permission" "cognito_create_auth" {
  statement_id  = "AllowCognitoInvokeCreateAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_create_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.cumbre.arn
}

resource "aws_cloudwatch_log_group" "cognito_verify_auth" {
  name              = "/aws/lambda/${local.prefix}-cognito-verify-auth"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-cognito-verify-auth-logs" }
}

data "archive_file" "cognito_verify_auth" {
  type        = "zip"
  source_dir  = "${path.root}/../../steps/dist/cognito-verify-auth"
  output_path = "${path.root}/../../steps/dist/cognito-verify-auth.zip"
}

resource "aws_lambda_function" "cognito_verify_auth" {
  function_name    = "${local.prefix}-cognito-verify-auth"
  role             = aws_iam_role.cognito_trigger.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.cognito_verify_auth.output_path
  source_code_hash = data.archive_file.cognito_verify_auth.output_base64sha256
  timeout          = 10
  memory_size      = 256

  vpc_config {
    subnet_ids         = local.s.private_subnet_ids
    security_group_ids = [aws_security_group.ecs_steps.id]
  }

  environment {
    variables = local.step_env
  }

  depends_on = [aws_cloudwatch_log_group.cognito_verify_auth, aws_iam_role_policy_attachment.cognito_trigger_vpc]
  tags       = { Name = "${local.prefix}-cognito-verify-auth" }
}

resource "aws_lambda_permission" "cognito_verify_auth" {
  statement_id  = "AllowCognitoInvokeVerifyAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_verify_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.cumbre.arn
}

# Dedicated app client for magic-link sign-in — isolated from the "web" client (which handles
# the existing OAuth hosted-UI password/Google flows) so enabling CUSTOM_AUTH here can never
# interact with or regress the existing, hardened login path.
resource "aws_cognito_user_pool_client" "magic_link" {
  name         = "${local.prefix}-magic-link"
  user_pool_id = aws_cognito_user_pool.cumbre.id

  generate_secret = true

  explicit_auth_flows = ["ALLOW_CUSTOM_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.prefix}-web"
  user_pool_id = aws_cognito_user_pool.cumbre.id

  generate_secret = true

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  callback_urls = ["https://${var.host_header}/auth/callback"]
  logout_urls   = ["https://${var.host_header}/login"]

  # Authorization Code + PKCE
  # ALLOW_REFRESH_TOKEN_AUTH is rejected when refresh_token_rotation is ENABLED (below);
  # rotation handles refresh-token reuse/rotation, and the app uses the OAuth code+PKCE flow
  # (token endpoint grant_type=refresh_token), so the explicit InitiateAuth refresh flow isn't needed.
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
  ]

  # Google added only when var.google_client_id is provided (gated IdP below).
  supported_identity_providers = var.google_client_id != "" ? ["COGNITO", "Google"] : ["COGNITO"]
  depends_on                   = [aws_cognito_identity_provider.google]

  prevent_user_existence_errors = "ENABLED"

  # Token hygiene
  enable_token_revocation = true
  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 30
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# Google federated sign-in (teed up; inactive until var.google_client_id is set).
# Owner creates an OAuth "Web application" client in Google Cloud Console; the Authorized
# redirect URI MUST be EXACTLY:
#   https://getcumbre-prd.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
resource "aws_cognito_identity_provider" "google" {
  count         = var.google_client_id != "" ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.cumbre.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }

  # Google IdP: AWS auto-populates extra provider_details keys -> perpetual drift without this.
  lifecycle {
    ignore_changes = [provider_details]
  }
}

# Authorize Cognito to send via the SES identity (required when email_sending_account=DEVELOPER).
# Gated on use_ses_email so it only exists once SES email is turned on.
resource "aws_ses_identity_policy" "cognito_send" {
  count    = var.use_ses_email ? 1 : 0
  identity = var.ses_identity_arn
  name     = "${local.prefix}-cognito-send"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCognitoSend"
      Effect    = "Allow"
      Principal = { Service = "cognito-idp.amazonaws.com" }
      Action    = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource  = var.ses_identity_arn
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        ArnLike      = { "aws:SourceArn" = aws_cognito_user_pool.cumbre.arn }
      }
    }]
  })
}

# ══════════════════════════════════════════════════════════════════════════════
# (b) RDS Postgres — certus-cumbre-prd-db
# ══════════════════════════════════════════════════════════════════════════════
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_subnet_group" "cumbre" {
  name        = local.prefix
  description = "Private subnets for ${local.prefix} RDS"
  subnet_ids  = local.s.private_subnet_ids

  tags = { Name = local.prefix }
}

resource "aws_security_group" "rds" {
  name        = "${local.prefix}-rds"
  description = "Allow Postgres from app ECS SG and steps Lambda SG"
  vpc_id      = local.s.vpc_id

  ingress {
    description     = "Postgres from app ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_steps.id]
  }

  # Web → RDS ingress is added via aws_security_group_rule.rds_from_web below,
  # using module.app.ecs_task_security_group_id (the module exports this output).

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-rds-sg" }

  # Prevent Terraform from fighting with aws_security_group_rule resources.
  # All ingress/egress changes go through separate aws_security_group_rule.
  lifecycle {
    ignore_changes = [ingress, egress]
  }
}

resource "aws_db_parameter_group" "cumbre" {
  name        = "${local.prefix}-pg16"
  family      = "postgres16"
  description = "Cumbre RDS Postgres 16 parameter group"

  parameter {
    name         = "max_connections"
    value        = "300"
    apply_method = "pending-reboot"
  }

  tags = { Name = "${local.prefix}-pg16" }
}

resource "aws_db_instance" "cumbre" {
  identifier            = "${local.prefix}-db"
  engine                = "postgres"
  engine_version        = "16"
  instance_class        = "db.t4g.small"
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"

  db_name  = "cumbre"
  username = var.db_master_username
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.cumbre.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.cumbre.name

  # Never publicly reachable
  publicly_accessible = false

  # Encrypt with shared KMS if available, else AWS-managed (default)
  storage_encrypted = true
  kms_key_id        = local.s.kms_secrets_key_arn != "" ? local.s.kms_secrets_key_arn : null

  # Safety
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.prefix}-db-final"
  backup_retention_period   = 7
  backup_window             = "03:00-04:00"
  maintenance_window        = "Mon:04:00-Mon:05:00"
  apply_immediately         = true

  # Multi-AZ standby: synchronous replication to a second AZ; automatic failover < 2 min.
  multi_az = true

  # Performance Insights (free tier)
  performance_insights_enabled = true

  tags = { Name = "${local.prefix}-db" }
}

# ── Ingress rule: allow app web ECS SG → RDS ─────────────────────────────────
# The module exports ecs_task_security_group_id — use it directly.
resource "aws_security_group_rule" "rds_from_web" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = module.app.ecs_task_security_group_id
  description              = "Postgres from web ECS tasks"
}

# ══════════════════════════════════════════════════════════════════════════════
# (c) S3 buckets
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_s3_bucket" "uploads" {
  bucket        = "${local.prefix}-uploads-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = { Name = "${local.prefix}-uploads", Purpose = "transient-audio" }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = local.s.kms_secrets_key_arn != "" ? "aws:kms" : "AES256"
      kms_master_key_id = local.s.kms_secrets_key_arn != "" ? local.s.kms_secrets_key_arn : null
    }
  }
}

# Audio is deleted after analysis — expire any objects left over after 1 day
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "expire-audio"
    status = "Enabled"
    filter { prefix = "" }
    expiration { days = 3 }
  }
}

# Browser uploads the audio directly to S3 via a presigned PUT — the bucket must allow
# cross-origin PUT/GET from the app origin or the browser blocks it (the "upload didn't go
# through" error). Origin = the app host.
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["https://${var.host_header}"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = { Name = "${local.prefix}-artifacts", Purpose = "ml-model" }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = local.s.kms_secrets_key_arn != "" ? "aws:kms" : "AES256"
      kms_master_key_id = local.s.kms_secrets_key_arn != "" ? local.s.kms_secrets_key_arn : null
    }
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# (d) Step Lambdas security group (shared by all step Lambdas)
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_security_group" "ecs_steps" {
  name        = "${local.prefix}-steps"
  description = "Shared SG for step Lambdas - egress to RDS and internet"
  vpc_id      = local.s.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-steps-sg" }
}

# ══════════════════════════════════════════════════════════════════════════════
# (e) Step Lambda IAM role (shared by all step Lambdas)
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_iam_role" "lambda_step" {
  name = "${local.prefix}-lambda-step"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.prefix}-lambda-step" }
}

resource "aws_iam_role_policy_attachment" "lambda_step_vpc" {
  role       = aws_iam_role.lambda_step.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "lambda_step_permissions" {
  name = "step-permissions"
  role = aws_iam_role.lambda_step.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadAppSecret"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        # The module creates the secret as "${local.prefix}/secrets"
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.prefix}/secrets*"
      },
      {
        Sid      = "S3Uploads"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Sid      = "S3UploadsList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.uploads.arn
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.prefix}-*:*"
      },
    ]
  })
}

# ── Step Lambda helper: local vars for all steps ──────────────────────────────
locals {
  step_names = ["validate", "moderate", "fingerprint", "charge", "deliver", "reject", "review", "fail"]

  # Common env vars injected into every step Lambda
  step_env = {
    AWS_ACCOUNT_ID   = data.aws_caller_identity.current.account_id
    S3_UPLOAD_BUCKET = aws_s3_bucket.uploads.id
    SECRET_ARN       = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.prefix}/secrets"
    REGION           = var.aws_region
    # Step Lambdas read DATABASE_URL from env (steps/lib/db.ts). Traffic routes through
    # the RDS Proxy for connection pooling; proxy endpoint is hostname-only (no port suffix).
    DATABASE_URL = "postgres://${var.db_master_username}:${random_password.db.result}@${aws_db_proxy.cumbre.endpoint}:5432/cumbre"
  }
}

# ── Step Lambda log groups ────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "lambda_step" {
  for_each          = toset(local.step_names)
  name              = "/aws/lambda/${local.prefix}-${each.key}"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-${each.key}-logs" }
}

# ── Step Lambda source archives ───────────────────────────────────────────────
# Each step is bundled by the CI step-build job into steps/dist/<name>/index.js
# If the dist directory is absent at plan time, archive_file will error —
# run `npm run build` in steps/ first, or use -target to apply other resources.
data "archive_file" "lambda_step" {
  for_each    = toset(local.step_names)
  type        = "zip"
  source_dir  = "${path.root}/../../steps/dist/${each.key}"
  output_path = "${path.root}/../../steps/dist/${each.key}.zip"
}

# ── Step Lambda functions ─────────────────────────────────────────────────────
resource "aws_lambda_function" "step" {
  for_each = toset(local.step_names)

  function_name    = "${local.prefix}-${each.key}"
  role             = aws_iam_role.lambda_step.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda_step[each.key].output_path
  source_code_hash = data.archive_file.lambda_step[each.key].output_base64sha256

  timeout     = 60
  memory_size = 512

  # 10 reserved per step Lambda (8 steps × 10 = 80 reserved).
  # Account limit raised to 1000 (Service Quotas, approved 2026-06-30).
  reserved_concurrent_executions = 10

  vpc_config {
    subnet_ids         = local.s.private_subnet_ids
    security_group_ids = [aws_security_group.ecs_steps.id]
  }

  environment {
    variables = local.step_env
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_step_vpc,
    aws_cloudwatch_log_group.lambda_step,
  ]

  tags = { Name = "${local.prefix}-${each.key}" }
}

# ══════════════════════════════════════════════════════════════════════════════
# (f) Worker ECR + ECS task definition
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_ecr_repository" "worker" {
  name                 = "${local.prefix}-worker"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = { Name = "${local.prefix}-worker" }
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.prefix}-worker"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-worker-logs" }
}

# Worker-specific Secrets Manager secret (Anthropic + OpenAI keys).
# Kept separate from the web app secret so the worker execution role has least-privilege
# access to only the keys it needs at task start.
resource "aws_secretsmanager_secret" "worker" {
  name       = "${local.prefix}-worker/secrets"
  kms_key_id = local.s.kms_secrets_key_arn != "" ? local.s.kms_secrets_key_arn : null
  tags       = { Name = "${local.prefix}-worker-secrets" }
}

resource "aws_secretsmanager_secret_version" "worker" {
  secret_id = aws_secretsmanager_secret.worker.id
  secret_string = jsonencode({
    ANTHROPIC_API_KEY = var.anthropic_api_key
    OPENAI_API_KEY    = var.openai_api_key
  })
  lifecycle { ignore_changes = [secret_string] }
}

resource "aws_iam_role" "worker_execution" {
  name = "${local.prefix}-worker-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
  tags = { Name = "${local.prefix}-worker-execution" }
}

resource "aws_iam_role_policy_attachment" "worker_execution_managed" {
  role       = aws_iam_role.worker_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow the ECS execution role to pull the worker secret at task start.
# The managed ECSTaskExecutionRolePolicy does NOT cover custom secrets — this
# explicit grant is required for ECS to inject them via the `secrets` block.
resource "aws_iam_role_policy" "worker_execution_secret" {
  name = "read-worker-secret"
  role = aws_iam_role.worker_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Sid      = "ReadWorkerSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.worker.arn
      }],
      # If a KMS CMK is in use, the execution role also needs kms:Decrypt
      local.s.kms_secrets_key_arn != "" ? [{
        Sid      = "DecryptWorkerSecret"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = local.s.kms_secrets_key_arn
      }] : []
    )
  })
}

resource "aws_iam_role" "worker_task" {
  name = "${local.prefix}-worker-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
  tags = { Name = "${local.prefix}-worker-task" }
}

resource "aws_iam_role_policy" "worker_task_permissions" {
  name = "worker-permissions"
  role = aws_iam_role.worker_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "S3Uploads"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Sid      = "S3Artifacts"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.artifacts.arn}/*"
      },
      {
        Sid      = "ReadAppSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.prefix}/secrets*"
      },
      {
        Sid      = "SFNTaskToken"
        Effect   = "Allow"
        Action   = ["states:SendTaskSuccess", "states:SendTaskFailure"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 4096
  execution_role_arn       = aws_iam_role.worker_execution.arn
  task_role_arn            = aws_iam_role.worker_task.arn
  tags                     = { Name = "${local.prefix}-worker" }

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${aws_ecr_repository.worker.repository_url}:latest"
    essential = true

    # Secrets injected by ECS execution role at task start (never baked into the image).
    secrets = [
      {
        name      = "ANTHROPIC_API_KEY"
        valueFrom = "${aws_secretsmanager_secret.worker.arn}:ANTHROPIC_API_KEY::"
      },
      {
        name      = "OPENAI_API_KEY"
        valueFrom = "${aws_secretsmanager_secret.worker.arn}:OPENAI_API_KEY::"
      },
    ]

    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "S3_UPLOAD_BUCKET", value = aws_s3_bucket.uploads.id },
      { name = "CUMBRE_MODEL_S3", value = aws_s3_bucket.artifacts.id },
      # numba (via librosa) needs a writable cache dir; the non-root container user has no
      # writable HOME, which caused numba "no locator available" cache errors at validate.
      { name = "NUMBA_CACHE_DIR", value = "/tmp/numba_cache" },
      { name = "HOME", value = "/tmp" },
      { name = "MPLCONFIGDIR", value = "/tmp/mpl" },
    ]

    # The task token is passed by Step Functions as a container override at RunTask time.
    # worker/aws_entry.py reads os.environ["TASK_TOKEN"].

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }

    # Worker is long-running; give it time to finish before SIGKILL
    stopTimeout = 120
  }])
}

# ══════════════════════════════════════════════════════════════════════════════
# (d) Step Functions state machine — certus-cumbre-prd-analyze
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_iam_role" "sfn" {
  name = "${local.prefix}-sfn"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })
  tags = { Name = "${local.prefix}-sfn" }
}

resource "aws_iam_role_policy" "sfn_permissions" {
  name = "sfn-permissions"
  role = aws_iam_role.sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeLambdaSteps"
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = concat(
          [for name in local.step_names :
            "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.prefix}-${name}"
          ],
          # Lambda worker (warm-container path replacing the Fargate waitForTaskToken).
          # Fargate RunTask statements below are kept for the revertible fallback.
          [aws_lambda_function.worker_lambda.arn]
        )
      },
      {
        Sid      = "RunWorkerTaskDef"
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task-definition/${local.prefix}-worker:*"
      },
      {
        Sid      = "StopDescribeWorkerTask"
        Effect   = "Allow"
        Action   = ["ecs:StopTask", "ecs:DescribeTasks"]
        Resource = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task/${local.s.ecs_cluster_name}/*"
      },
      {
        Sid      = "PassWorkerRoles"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.worker_execution.arn, aws_iam_role.worker_task.arn]
      },
      {
        # Required for ecs:runTask.waitForTaskToken — Step Functions manages an
        # EventBridge rule named "StepFunctionsGetEventsForECSTaskRule" to track
        # task completion and deliver the task token callback.
        Sid    = "EventBridgeWaitForTaskToken"
        Effect = "Allow"
        Action = [
          "events:PutTargets",
          "events:PutRule",
          "events:DescribeRule",
        ]
        Resource = "arn:aws:events:${var.aws_region}:${data.aws_caller_identity.current.account_id}:rule/StepFunctionsGetEventsForECSTaskRule"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups",
        ]
        Resource = "*"
      },
      {
        Sid      = "XRay"
        Effect   = "Allow"
        Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "sfn" {
  name              = "/aws/states/${local.prefix}-analyze"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-sfn-logs" }
}

# Worker security group (egress-all; no ingress needed — Step Functions triggers it)
resource "aws_security_group" "worker" {
  name        = "${local.prefix}-worker"
  description = "ECS worker task SG - egress to S3/Secrets/RDS"
  vpc_id      = local.s.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-worker-sg" }
}

# Allow worker → RDS
resource "aws_security_group_rule" "rds_from_worker" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.worker.id
  description              = "Postgres from worker ECS tasks"
}

resource "aws_sfn_state_machine" "analyze" {
  name     = "${local.prefix}-analyze"
  role_arn = aws_iam_role.sfn.arn
  type     = "STANDARD"

  # ASL definition — created by the team at infra/sfn/analyze.asl.json
  # templatefile() injects the Lambda ARNs, worker cluster/taskdef/SG/subnet, and
  # container name. The file MUST exist before `terraform apply`.
  # If it is absent, Terraform will error with: "Invalid template file path".
  definition = templatefile("${path.root}/../sfn/analyze.asl.json", {
    validate_fn_arn    = aws_lambda_function.step["validate"].arn
    moderate_fn_arn    = aws_lambda_function.step["moderate"].arn
    fingerprint_fn_arn = aws_lambda_function.step["fingerprint"].arn
    charge_fn_arn      = aws_lambda_function.step["charge"].arn
    deliver_fn_arn     = aws_lambda_function.step["deliver"].arn
    reject_fn_arn      = aws_lambda_function.step["reject"].arn
    review_fn_arn      = aws_lambda_function.step["review"].arn
    fail_fn_arn        = aws_lambda_function.step["fail"].arn

    # Lambda worker (warm-container path -- replaces the Fargate waitForTaskToken).
    # The Fargate ECS task definition / ECR repo remain unchanged as a revertible
    # fallback: to revert, swap the ASL back to the ecs:runTask.waitForTaskToken
    # resource and pass the ecs_cluster_arn / worker_task_def_arn vars instead.
    worker_lambda_arn = aws_lambda_function.worker_lambda.arn

    # Numeric threshold passed to the ConfidenceChoice NumericLessThan condition
    low_confidence_threshold = tonumber(var.low_confidence_threshold)
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  tracing_configuration {
    enabled = true
  }

  tags = { Name = "${local.prefix}-analyze" }
}

# ══════════════════════════════════════════════════════════════════════════════
# Base app module — ECS web service, ECR, ALB rule, Secrets Manager, IAM,
# CloudWatch alarms, dashboard, budget hard-stop
# ══════════════════════════════════════════════════════════════════════════════
module "app" {
  source = "../../../infra/terraform/modules/app"

  team        = "hub"
  app_name    = "cumbre"
  environment = var.environment
  aws_region  = var.aws_region
  host_header = var.host_header

  # ── Auth: disabled — Cumbre is public; auth is in-app Cognito OIDC ──────────
  enable_auth = false

  # ── Container ────────────────────────────────────────────────────────────────
  container_port    = 3000
  container_cpu     = 512
  container_memory  = 1024
  health_check_path = "/api/health"

  # ── Scaling ──────────────────────────────────────────────────────────────────
  # Scale-to-zero disabled: getcumbre.com is global, so a nightly scale-down would be
  # downtime for non-US users. Keep min_tasks running 24/7 (base=1 on-demand in the module).
  enable_schedule_scaling = false
  min_tasks               = 1
  max_tasks               = 16

  # ── CI/CD ────────────────────────────────────────────────────────────────────
  github_repo        = var.github_repo
  github_environment = var.github_environment

  # ── Budget ───────────────────────────────────────────────────────────────────
  admin_email        = var.admin_email
  monthly_budget_usd = var.monthly_budget_usd

  # ── Route53 (optional — set zone_id in tfvars to get an A record) ────────────
  route53_zone_id = var.route53_zone_id
  alb_dns_name    = local.s.alb_dns_name

  # ── Shared infra wired from remote state ─────────────────────────────────────
  vpc_id                   = local.s.vpc_id
  public_subnet_ids        = local.s.public_subnet_ids
  private_subnet_ids       = local.s.private_subnet_ids
  alb_sg_id                = local.s.alb_sg_id
  alb_arn                  = local.s.alb_arn
  alb_arn_suffix           = local.s.alb_arn_suffix
  alb_listener_https_arn   = local.s.alb_listener_https_arn
  ecs_cluster_id           = local.s.ecs_cluster_id
  ecs_cluster_name         = local.s.ecs_cluster_name
  cognito_user_pool_id     = local.s.cognito_user_pool_id # shared pool (unused by Cumbre; still required input)
  cognito_user_pool_arn    = local.s.cognito_user_pool_arn
  cognito_domain           = local.s.cognito_domain
  sns_alerts_arn           = local.s.sns_alerts_arn
  github_oidc_provider_arn = local.s.github_oidc_provider_arn
  aws_account_id           = local.s.aws_account_id
  kms_logs_key_arn         = local.s.kms_logs_key_arn
  kms_secrets_key_arn      = local.s.kms_secrets_key_arn

  # ── Secrets (Secrets Manager; never in image) ─────────────────────────────────
  app_secrets = {
    DATABASE_URL             = "postgres://${var.db_master_username}:${random_password.db.result}@${aws_db_proxy.cumbre.endpoint}:5432/cumbre"
    COGNITO_CLIENT_SECRET    = aws_cognito_user_pool_client.web.client_secret
    MAGIC_LINK_CLIENT_SECRET = aws_cognito_user_pool_client.magic_link.client_secret
    SESSION_SECRET           = var.session_secret
    STRIPE_SECRET_KEY        = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET    = var.stripe_webhook_secret
    STRIPE_PRICE_SUMMIT      = var.stripe_price_summit
    STRIPE_PRICE_SEASON      = var.stripe_price_season
    OPENAI_API_KEY           = var.openai_api_key
    ACRCLOUD_HOST            = var.acrcloud_host
    ACRCLOUD_ACCESS_KEY      = var.acrcloud_access_key
    ACRCLOUD_ACCESS_SECRET   = var.acrcloud_access_secret
  }

  # ── Non-secret env vars ───────────────────────────────────────────────────────
  app_env_vars = {
    NEXT_PUBLIC_APP_URL              = "https://${var.host_header}"
    NEXT_PUBLIC_SITE_URL             = "https://${var.host_header}"
    NEXT_PUBLIC_STRIPE_SUMMIT_URL    = "https://buy.stripe.com/bJe6oG5WL8GI7flbQJawo01"
    NEXT_PUBLIC_STRIPE_SEASON_URL    = "https://buy.stripe.com/fZufZgad13mo9nt081awo00"
    NEXT_PUBLIC_GOOGLE_ENABLED       = var.google_client_id != "" ? "true" : "false"
    COGNITO_USER_POOL_ID             = aws_cognito_user_pool.cumbre.id
    COGNITO_CLIENT_ID                = aws_cognito_user_pool_client.web.id
    MAGIC_LINK_CLIENT_ID             = aws_cognito_user_pool_client.magic_link.id
    COGNITO_DOMAIN                   = var.cognito_domain_prefix
    COGNITO_ISSUER                   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.cumbre.id}"
    S3_UPLOAD_BUCKET                 = aws_s3_bucket.uploads.id
    ANALYZE_STATE_MACHINE_ARN        = aws_sfn_state_machine.analyze.arn
    ADMIN_EMAILS                     = var.admin_emails
    KILL_SWITCH_SCORING              = var.kill_switch_scoring
    LOW_CONFIDENCE_THRESHOLD         = var.low_confidence_threshold
    NEXT_PUBLIC_RUM_APP_MONITOR_ID   = aws_rum_app_monitor.cumbre.id
    NEXT_PUBLIC_RUM_IDENTITY_POOL_ID = aws_cognito_identity_pool.rum.id
    NEXT_PUBLIC_AWS_REGION           = var.aws_region
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# (g) Extend the web task role with app-specific permissions
# The module names the task role "${local.prefix}-ecs-task".
# We attach an extra inline policy rather than touching the module.
# ══════════════════════════════════════════════════════════════════════════════
resource "aws_iam_role_policy" "web_task_extra" {
  name = "cumbre-web-extra"
  role = "${local.prefix}-ecs-task"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "S3Uploads"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Sid      = "S3UploadsList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.uploads.arn
      },
      {
        Sid      = "StartSFN"
        Effect   = "Allow"
        Action   = ["states:StartExecution"]
        Resource = aws_sfn_state_machine.analyze.arn
      },
      {
        # Magic-link server actions (web/lib/actions/magicLink.ts): look up existing users by
        # email, provision brand-new passwordless users, and drive the CUSTOM_AUTH challenge.
        Sid    = "MagicLinkAuth"
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
        ]
        Resource = aws_cognito_user_pool.cumbre.arn
      },
    ]
  })

  depends_on = [module.app]
}

# ── GitHub deploy role: also allow pushing to the worker ECR ─────────────────
# The module's github_deploy role only has ECR push for the web ECR.
# We attach an extra policy for the worker ECR so CI can push both images.
resource "aws_iam_role_policy" "github_deploy_worker_ecr" {
  name = "worker-ecr-push"
  role = "${local.prefix}-github-deploy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRPushWorker"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
        ]
        Resource = aws_ecr_repository.worker.arn
      },
    ]
  })

  depends_on = [module.app]
}

# ══════════════════════════════════════════════════════════════════════════════
# (h) Lambda worker -- warm-container path (additive; Fargate path kept intact)
# ECR repo: hub-cumbre-prd-worker-lambda
# Lambda:   hub-cumbre-prd-worker-lambda
#
# IMPORTANT -- chicken-and-egg on first deploy:
#   1. Run `terraform apply` with -target=aws_ecr_repository.worker_lambda to
#      create the ECR repo first.
#   2. Build + push the Lambda image:
#        docker build -f worker/Dockerfile.lambda -t <repo_url>:latest .
#        docker push <repo_url>:latest
#   3. Run the full `terraform apply` to create the Lambda function and update
#      the state machine.  The Lambda resource will fail if the repo is empty.
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_ecr_repository" "worker_lambda" {
  name                 = "${local.prefix}-worker-lambda"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = { Name = "${local.prefix}-worker-lambda" }
}

resource "aws_ecr_lifecycle_policy" "worker_lambda" {
  repository = aws_ecr_repository.worker_lambda.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "worker_lambda" {
  name              = "/aws/lambda/${local.prefix}-worker-lambda"
  retention_in_days = 14
  kms_key_id        = local.s.kms_logs_key_arn != "" ? local.s.kms_logs_key_arn : null
  tags              = { Name = "${local.prefix}-worker-lambda-logs" }
}

resource "aws_iam_role" "worker_lambda" {
  name = "${local.prefix}-worker-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.prefix}-worker-lambda" }
}

# VPC access (ENI create/delete) + basic CloudWatch Logs
resource "aws_iam_role_policy_attachment" "worker_lambda_vpc" {
  role       = aws_iam_role.worker_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "worker_lambda_permissions" {
  name = "worker-lambda-permissions"
  role = aws_iam_role.worker_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "S3Uploads"
          Effect   = "Allow"
          Action   = ["s3:GetObject", "s3:DeleteObject"]
          Resource = "${aws_s3_bucket.uploads.arn}/*"
        },
        {
          Sid      = "S3Artifacts"
          Effect   = "Allow"
          Action   = ["s3:GetObject"]
          Resource = "${aws_s3_bucket.artifacts.arn}/*"
        },
        {
          Sid      = "ReadWorkerSecret"
          Effect   = "Allow"
          Action   = ["secretsmanager:GetSecretValue"]
          Resource = aws_secretsmanager_secret.worker.arn
        },
        {
          Sid      = "CloudWatchLogs"
          Effect   = "Allow"
          Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
          Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.prefix}-worker-lambda:*"
        },
      ],
      # If a KMS CMK is in use, the Lambda role also needs kms:Decrypt
      local.s.kms_secrets_key_arn != "" ? [{
        Sid      = "KmsDecrypt"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = local.s.kms_secrets_key_arn
      }] : []
    )
  })
}

# ── Lambda function ───────────────────────────────────────────────────────────
# package_type=Image: image_uri must reference an existing tag in the repo.
# The very first deploy requires the image to be pushed BEFORE terraform apply
# (see chicken-and-egg note above).
resource "aws_lambda_function" "worker_lambda" {
  function_name = "${local.prefix}-worker-lambda"
  role          = aws_iam_role.worker_lambda.arn
  package_type  = "Image"

  # Lambda doesn't accept multi-arch OCI index tags; must reference a single-arch manifest.
  # Use the specific amd64 digest extracted from the OCI index (:latest).
  # Update this digest after each image rebuild (see docs/AWS_RUNBOOK.md).
  image_uri = "${aws_ecr_repository.worker_lambda.repository_url}@sha256:2dbba0c661f43f95689055a66f87dc61b3256f04d891ca9bf4f906310bf08ddc"

  # 3008 MB = standard AWS Lambda quota ceiling (requires quota increase for higher).
  # Sufficient for librosa/numba/sklearn; ephemeral_storage gives 4 GB /tmp for audio.
  memory_size = 3008

  # Lambda max timeout = 15 min (same as the Fargate task's 900 s timeout).
  timeout = 900

  # 30 reserved for the ML worker Lambda.
  # Account limit raised to 1000 (Service Quotas, approved 2026-06-30).
  reserved_concurrent_executions = 30

  ephemeral_storage {
    # /tmp: 4 GB for audio download + numba temp files
    size = 4096
  }

  vpc_config {
    # Reuse the existing worker security group (egress-all; S3/Secrets via VPC endpoints)
    subnet_ids         = local.s.private_subnet_ids
    security_group_ids = [aws_security_group.worker.id]
  }

  environment {
    variables = {
      S3_UPLOAD_BUCKET = aws_s3_bucket.uploads.id
      # Bucket name (not URI) so aws_entry._parse_model_loc() resolves the key correctly
      CUMBRE_MODEL_S3 = aws_s3_bucket.artifacts.id
      # API keys passed as plain env vars here; for tighter least-privilege these
      # could be injected via a Lambda extension reading from Secrets Manager instead.
      ANTHROPIC_API_KEY = var.anthropic_api_key
      OPENAI_API_KEY    = var.openai_api_key
      # numba / matplotlib dirs -- /opt/numba_cache is baked into the image at build
      # time (pre-warmed); /tmp is the Lambda writable scratchpad.
      NUMBA_CACHE_DIR = "/opt/numba_cache"
      HOME            = "/tmp"
      MPLCONFIGDIR    = "/tmp"
      # AWS_REGION is reserved by Lambda and cannot be overridden — removed.
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [
    aws_iam_role_policy_attachment.worker_lambda_vpc,
    aws_cloudwatch_log_group.worker_lambda,
    aws_ecr_repository.worker_lambda,
  ]

  tags = { Name = "${local.prefix}-worker-lambda" }
}

# ── Allow CI to push the Lambda worker image to ECR ──────────────────────────
resource "aws_iam_role_policy" "github_deploy_worker_lambda_ecr" {
  name = "worker-lambda-ecr-push"
  role = "${local.prefix}-github-deploy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRPushWorkerLambda"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
        ]
        Resource = aws_ecr_repository.worker_lambda.arn
      },
    ]
  })

  depends_on = [module.app]
}
