# ══════════════════════════════════════════════════════════════════════════════
# Cross-region DR backup — AWS Backup with daily RDS snapshot + copy to us-west-2
# Closes data durability gap: RPO < 24h, survives a full us-east-1 outage.
# Cost: ~$3-5/month at current RDS size (20 GB allocated).
# ══════════════════════════════════════════════════════════════════════════════

# ── DR vault in us-west-2 (receives copies via copy_action) ──────────────────
resource "aws_backup_vault" "cumbre_dr" {
  provider = aws.dr
  name     = "${local.prefix}-dr"
  tags     = { Name = "${local.prefix}-backup-vault-dr" }
}

# ── Primary vault in us-east-1 ───────────────────────────────────────────────
resource "aws_backup_vault" "cumbre" {
  name = "${local.prefix}-backup"
  tags = { Name = "${local.prefix}-backup-vault" }
}

# ── Backup plan: daily at 05:00 UTC, 14-day local retention, copy to DR ──────
resource "aws_backup_plan" "cumbre" {
  name = "${local.prefix}-backup-plan"

  rule {
    rule_name         = "daily-rds"
    target_vault_name = aws_backup_vault.cumbre.name
    schedule          = "cron(0 5 * * ? *)"
    start_window      = 60
    completion_window = 180

    lifecycle {
      delete_after = 14
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.cumbre_dr.arn

      lifecycle {
        delete_after = 7
      }
    }
  }

  tags = { Name = "${local.prefix}-backup-plan" }
}

# ── IAM role that AWS Backup assumes to snapshot RDS ─────────────────────────
resource "aws_iam_role" "backup" {
  name = "${local.prefix}-backup"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "backup.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.prefix}-backup-role" }
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "backup_restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# ── Backup selection: include the RDS instance ────────────────────────────────
resource "aws_backup_selection" "cumbre" {
  name         = "${local.prefix}-rds"
  plan_id      = aws_backup_plan.cumbre.id
  iam_role_arn = aws_iam_role.backup.arn

  resources = [aws_db_instance.cumbre.arn]
}
