import json
import subprocess
import time

aws = r"C:\Program Files\Amazon\AWSCLIV2\aws.exe"
cmd = (
    'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 '
    "-c \"SELECT column_name FROM information_schema.columns "
    "WHERE table_name = 'review_queue' AND column_name = 'priority';\" "
    "-c \"SELECT COUNT(*) AS mv_jobs_rows FROM mv_jobs_by_day;\" "
    "-c \"SELECT COUNT(*) AS mv_review_rows FROM mv_review_queue_stats;\""
)
task = {
    "family": "hub-cumbre-prd-migrate-005-verify",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "256",
    "memory": "512",
    "executionRoleArn": "arn:aws:iam::110844251073:role/hub-cumbre-prd-ecs-execution",
    "containerDefinitions": [
        {
            "name": "verify",
            "image": "public.ecr.aws/docker/library/postgres:16-alpine",
            "essential": True,
            "secrets": [
                {
                    "name": "DATABASE_URL",
                    "valueFrom": "arn:aws:secretsmanager:us-east-1:110844251073:secret:hub-cumbre-prd/secrets-wQNDw3:DATABASE_URL::",
                }
            ],
            "command": ["sh", "-c", cmd],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/hub-cumbre-prd",
                    "awslogs-region": "us-east-1",
                    "awslogs-stream-prefix": "migrate-005-verify",
                },
            },
        }
    ],
}
subprocess.run(
    [aws, "ecs", "register-task-definition", "--cli-input-json", json.dumps(task), "--region", "us-east-1"],
    check=True,
)
run = subprocess.run(
    [
        aws,
        "ecs",
        "run-task",
        "--cluster",
        "hub-prd",
        "--task-definition",
        "hub-cumbre-prd-migrate-005-verify:1",
        "--launch-type",
        "FARGATE",
        "--region",
        "us-east-1",
        "--network-configuration",
        "awsvpcConfiguration={subnets=[subnet-0db165adbbf848ce6,subnet-0da3a5c4afa351d46],securityGroups=[sg-0e969e75763ddb736],assignPublicIp=DISABLED}",
        "--query",
        "tasks[0].taskArn",
        "--output",
        "text",
    ],
    capture_output=True,
    text=True,
    check=True,
)
task_arn = run.stdout.strip()
print("task", task_arn)
for i in range(30):
    time.sleep(8)
    d = subprocess.run(
        [aws, "ecs", "describe-tasks", "--cluster", "hub-prd", "--tasks", task_arn, "--region", "us-east-1", "--output", "json"],
        capture_output=True,
        text=True,
        check=True,
    )
    t = json.loads(d.stdout)["tasks"][0]
    last = t["lastStatus"]
    exit_code = t.get("containers", [{}])[0].get("exitCode")
    print(f"[{i + 1}] {last} exit={exit_code}")
    if last == "STOPPED":
        raise SystemExit(0 if exit_code == 0 else 1)
raise SystemExit(1)
