# One-off migration runner: applies db/*.sql in order to the private RDS via a Fargate task.
# Build context = cumbre repo root (so it can COPY db/).
#   docker build -f infra/migrate/Dockerfile -t <ecr>/hub-cumbre-prd:migrate .
# DATABASE_URL is injected by the ECS task (from Secrets Manager) at run time.
FROM postgres:16-alpine
COPY db/ /migrations/
ENTRYPOINT ["sh","-c","set -e; for f in 001_schema 002_subscriptions 003_feedback 004_billing_hardening; do echo \">>> applying $f\"; psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f /migrations/$f.sql; done; echo '>>> all migrations applied'"]
