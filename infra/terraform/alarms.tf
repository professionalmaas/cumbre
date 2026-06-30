# ══════════════════════════════════════════════════════════════════════════════
# Production observability - CloudWatch metric alarms
# Additive only. Every alarm notifies the shared SNS alerts topic.
# ASCII only in all strings (AWS rejects em-dashes in some fields).
# ══════════════════════════════════════════════════════════════════════════════

# ── Step Functions ────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "sfn_executions_failed" {
  alarm_name          = "${local.prefix}-sfn-executions-failed"
  alarm_description   = "Step Functions analyze state machine had a failed execution."
  namespace           = "AWS/States"
  metric_name         = "ExecutionsFailed"
  statistic           = "Sum"
  period              = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.analyze.arn
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

resource "aws_cloudwatch_metric_alarm" "sfn_executions_timed_out" {
  alarm_name          = "${local.prefix}-sfn-executions-timed-out"
  alarm_description   = "Step Functions analyze state machine had a timed-out execution."
  namespace           = "AWS/States"
  metric_name         = "ExecutionsTimedOut"
  statistic           = "Sum"
  period              = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.analyze.arn
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

# ── Step Lambdas (one alarm per step, per metric) ─────────────────────────────
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(local.step_names)

  alarm_name          = "${local.prefix}-${each.key}-errors"
  alarm_description   = "Step Lambda ${each.key} reported one or more errors."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${local.prefix}-${each.key}"
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each = toset(local.step_names)

  alarm_name          = "${local.prefix}-${each.key}-throttles"
  alarm_description   = "Step Lambda ${each.key} was throttled."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${local.prefix}-${each.key}"
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

# ── RDS ───────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.prefix}-rds-cpu-high"
  alarm_description   = "RDS CPU utilization above 80 percent."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  evaluation_periods  = 3
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.cumbre.identifier
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${local.prefix}-rds-free-storage-low"
  alarm_description   = "RDS free storage space below 2 GB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Average"
  period              = 300
  comparison_operator = "LessThanThreshold"
  threshold           = 2000000000
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.cumbre.identifier
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.prefix}-rds-connections-high"
  alarm_description   = "RDS database connections above 60."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Average"
  period              = 300
  comparison_operator = "GreaterThanThreshold"
  threshold           = 60
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.cumbre.identifier
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory" {
  alarm_name          = "${local.prefix}-rds-freeable-memory-low"
  alarm_description   = "RDS freeable memory below 64 MB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  statistic           = "Average"
  period              = 300
  comparison_operator = "LessThanThreshold"
  threshold           = 67108864
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.cumbre.identifier
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

# ── ALB — user-facing latency + error rate ────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "alb_p95_latency" {
  alarm_name          = "${local.prefix}-alb-p95-latency-high"
  alarm_description   = "ALB target response time p95 above 3 seconds — user experience degraded."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  period              = 60
  comparison_operator = "GreaterThanThreshold"
  threshold           = 3
  evaluation_periods  = 3
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = local.s.alb_arn_suffix
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_rate" {
  alarm_name          = "${local.prefix}-alb-5xx-errors"
  alarm_description   = "ALB 5xx error count above 5 in one minute — possible application crash."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 60
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  evaluation_periods  = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = local.s.alb_arn_suffix
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

resource "aws_cloudwatch_metric_alarm" "alb_4xx_rate" {
  alarm_name          = "${local.prefix}-alb-4xx-spike"
  alarm_description   = "ALB 4xx count above 50 in one minute — possible scraping or auth loop."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_4XX_Count"
  statistic           = "Sum"
  period              = 60
  comparison_operator = "GreaterThanThreshold"
  threshold           = 50
  evaluation_periods  = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = local.s.alb_arn_suffix
  }

  alarm_actions = [local.s.sns_alerts_arn]
}

# ── Step Functions — concurrency throttle ─────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "sfn_throttled" {
  alarm_name          = "${local.prefix}-sfn-executions-throttled"
  alarm_description   = "SFN executions throttled — state machine overloaded or StartExecution rate exceeded"
  namespace           = "AWS/States"
  metric_name         = "ExecutionsThrottled"
  statistic           = "Sum"
  period              = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.analyze.arn
  }

  alarm_actions = [local.s.sns_alerts_arn]
}
