# ══════════════════════════════════════════════════════════════════════════════
# RDS Proxy — infrastructure-level connection pooling (Scalability A→A+)
# Multiplexes up to 16 ECS tasks × 5 connections = 80 potential connections
# into a shared pool, preventing connection exhaustion at traffic spikes.
# Cost: ~$22/month (db.t4g.small = 2 vCPU × $0.015/hr × 720h)
# ══════════════════════════════════════════════════════════════════════════════

# ── DB credentials secret (RDS-compatible JSON format required by the proxy) ──
resource "aws_secretsmanager_secret" "db_proxy_auth" {
  name        = "${local.prefix}-db-proxy-auth"
  description = "RDS Proxy auth credentials"
  kms_key_id  = local.s.kms_secrets_key_arn != "" ? local.s.kms_secrets_key_arn : null

  tags = { Name = "${local.prefix}-db-proxy-auth" }
}

resource "aws_secretsmanager_secret_version" "db_proxy_auth" {
  secret_id = aws_secretsmanager_secret.db_proxy_auth.id
  secret_string = jsonencode({
    engine   = "postgres"
    username = var.db_master_username
    password = random_password.db.result
    host     = aws_db_instance.cumbre.address
    dbname   = "cumbre"
    port     = 5432
  })

  lifecycle { ignore_changes = [secret_string] }
}

# ── IAM role the proxy assumes to read the auth secret ───────────────────────
resource "aws_iam_role" "db_proxy" {
  name = "${local.prefix}-db-proxy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.prefix}-db-proxy-role" }
}

resource "aws_iam_role_policy" "db_proxy" {
  name = "db-proxy-secrets"
  role = aws_iam_role.db_proxy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Sid      = "GetDBSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = aws_secretsmanager_secret.db_proxy_auth.arn
      }],
      local.s.kms_secrets_key_arn != "" ? [{
        Sid      = "DecryptSecret"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = local.s.kms_secrets_key_arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${var.aws_region}.amazonaws.com"
          }
        }
      }] : []
    )
  })
}

# ── Proxy security group ──────────────────────────────────────────────────────
resource "aws_security_group" "rds_proxy" {
  name        = "${local.prefix}-rds-proxy"
  description = "RDS Proxy: accepts Postgres from app and steps; forwards to RDS"
  vpc_id      = local.s.vpc_id

  egress {
    description     = "Postgres out to RDS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds.id]
  }

  tags = { Name = "${local.prefix}-rds-proxy-sg" }
}

resource "aws_security_group_rule" "proxy_from_web" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds_proxy.id
  source_security_group_id = module.app.ecs_task_security_group_id
  description              = "Postgres from web ECS tasks"
}

resource "aws_security_group_rule" "proxy_from_steps" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds_proxy.id
  source_security_group_id = aws_security_group.ecs_steps.id
  description              = "Postgres from Lambda step functions"
}

# RDS accepts connections from the proxy (additive; existing direct-from-app rules kept as fallback)
resource "aws_security_group_rule" "rds_from_proxy" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.rds_proxy.id
  description              = "Postgres from RDS Proxy"
}

# ── RDS Proxy ─────────────────────────────────────────────────────────────────
resource "aws_db_proxy" "cumbre" {
  name           = "${local.prefix}-proxy"
  engine_family  = "POSTGRESQL"
  role_arn       = aws_iam_role.db_proxy.arn
  vpc_subnet_ids = local.s.private_subnet_ids

  vpc_security_group_ids = [aws_security_group.rds_proxy.id]

  auth {
    auth_scheme = "SECRETS"
    description = "Master credentials"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_proxy_auth.arn
  }

  require_tls         = true
  idle_client_timeout = 1800

  tags = { Name = "${local.prefix}-proxy" }
}

# ── Connection pool config ────────────────────────────────────────────────────
resource "aws_db_proxy_default_target_group" "cumbre" {
  db_proxy_name = aws_db_proxy.cumbre.name

  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

# ── Point proxy at the RDS instance ──────────────────────────────────────────
resource "aws_db_proxy_target" "cumbre" {
  db_instance_identifier = aws_db_instance.cumbre.identifier
  db_proxy_name          = aws_db_proxy.cumbre.name
  target_group_name      = aws_db_proxy_default_target_group.cumbre.name
}
