import base64
import json
import pathlib

sql = pathlib.Path(r"c:\Users\ob1_k\Projects\cumbre\db\006_teaser_paywall_magic_link.sql").read_text(
    encoding="utf-8"
)
b64 = base64.b64encode(sql.encode()).decode()
cmd = 'echo "$SQL_B64" | base64 -d > /tmp/m.sql && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/m.sql'
task = {
    "family": "hub-cumbre-prd-migrate-006",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "256",
    "memory": "512",
    "executionRoleArn": "arn:aws:iam::110844251073:role/hub-cumbre-prd-ecs-execution",
    "taskRoleArn": "arn:aws:iam::110844251073:role/hub-cumbre-prd-ecs-task",
    "containerDefinitions": [
        {
            "name": "migrate",
            "image": "public.ecr.aws/docker/library/postgres:16-alpine",
            "essential": True,
            "environment": [{"name": "SQL_B64", "value": b64}],
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
                    "awslogs-stream-prefix": "migrate-006",
                },
            },
        }
    ],
}
out = pathlib.Path(__file__).with_name("migrate-task.json")
out.write_text(json.dumps(task), encoding="utf-8")
print(out)
