# ══════════════════════════════════════════════════════════════════════════════
# CloudWatch RUM — real user monitoring for browser-side latency
# Captures LCP, FCP, FID, CLS, HTTP timing per user session.
# Cost: ~$1-2/month at current traffic. SDK injected via RumSnippet.tsx.
# ══════════════════════════════════════════════════════════════════════════════

resource "aws_rum_app_monitor" "cumbre" {
  name   = "${local.prefix}-rum"
  domain = var.host_header

  app_monitor_configuration {
    allow_cookies       = true
    enable_xray         = true
    session_sample_rate = 1.0
    telemetries         = ["errors", "performance", "http"]

    identity_pool_id = aws_cognito_identity_pool.rum.id

    guest_role_arn = aws_iam_role.rum_monitor.arn
  }

  custom_events {
    status = "ENABLED"
  }

  tags = { Name = "${local.prefix}-rum" }
}

# Cognito identity pool for unauthenticated RUM SDK credentials (browser can't hold IAM keys)
resource "aws_cognito_identity_pool" "rum" {
  identity_pool_name               = "${local.prefix}-rum"
  allow_unauthenticated_identities = true

  tags = { Name = "${local.prefix}-rum-idpool" }
}

resource "aws_iam_role" "rum_monitor" {
  name = "${local.prefix}-rum-monitor"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = "cognito-identity.amazonaws.com" }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.rum.id
        }
        "ForAnyValue:StringLike" = {
          "cognito-identity.amazonaws.com:amr" = "unauthenticated"
        }
      }
    }]
  })

  tags = { Name = "${local.prefix}-rum-monitor-role" }
}

resource "aws_iam_role_policy" "rum_monitor" {
  name = "rum-put-events"
  role = aws_iam_role.rum_monitor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["rum:PutRumEvents"]
      Resource = aws_rum_app_monitor.cumbre.arn
    }]
  })
}

resource "aws_cognito_identity_pool_roles_attachment" "rum" {
  identity_pool_id = aws_cognito_identity_pool.rum.id

  roles = {
    unauthenticated = aws_iam_role.rum_monitor.arn
  }
}
