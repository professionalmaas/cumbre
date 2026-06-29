# KMS grants for CMK-encrypted S3 (uploads + artifacts use the shared secrets CMK).
# Roles that READ encrypted objects need kms:Decrypt; the WRITER (web) also needs
# kms:GenerateDataKey for SSE-KMS PutObject.
# Discovered during launch QA: the worker's S3 GetObject failed with
# "kms:Decrypt AccessDenied". The web upload (PutObject) and the deliver/charge
# Lambdas (Get/Delete) hit the same gap. Granted here, conditional on a CMK being in use.
locals {
  cmk = local.s.kms_secrets_key_arn
}

resource "aws_iam_role_policy" "worker_task_kms" {
  count = local.cmk != "" ? 1 : 0
  name  = "kms-s3"
  role  = aws_iam_role.worker_task.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Sid = "KmsS3Read", Effect = "Allow", Action = ["kms:Decrypt"], Resource = local.cmk }]
  })
}

resource "aws_iam_role_policy" "lambda_step_kms" {
  count = local.cmk != "" ? 1 : 0
  name  = "kms-s3"
  role  = aws_iam_role.lambda_step.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Sid = "KmsS3Read", Effect = "Allow", Action = ["kms:Decrypt"], Resource = local.cmk }]
  })
}

resource "aws_iam_role_policy" "web_task_kms" {
  count      = local.cmk != "" ? 1 : 0
  name       = "kms-s3"
  role       = "${local.prefix}-ecs-task"
  depends_on = [module.app]
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Sid = "KmsS3ReadWrite", Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = local.cmk }]
  })
}
