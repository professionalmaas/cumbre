# Terraform workflow for Cumbre PRD
# Always run from this directory: cd infra/terraform
#
# terraform.tfvars (gitignored) is auto-loaded and is the ONLY source of truth.
# Never pass -var-file — it overrides real values with template placeholders.

.PHONY: plan apply init unlock fmt validate

plan:
	terraform plan

apply:
	terraform apply -auto-approve

# Show what apply would do, then require confirmation before running.
safe-apply:
	terraform plan -out=.tfplan
	@echo "\nReview plan above. Press ENTER to apply or Ctrl+C to abort."
	@read _
	terraform apply .tfplan
	@rm -f .tfplan

init:
	terraform init -reconfigure

unlock:
	@echo "Usage: make unlock LOCK_ID=<id from error>"
	terraform force-unlock -force $(LOCK_ID)

fmt:
	terraform fmt -recursive

validate:
	terraform validate
	@echo "Checking critical var values in terraform.tfvars..."
	@grep -q 'host_header\s*=\s*"getcumbre\.com"' terraform.tfvars || \
	  (echo "ERROR: host_header must be 'getcumbre.com' — wrong value breaks ALB routing + Cognito callbacks + S3 CORS" && exit 1)
	@grep -q 'shared_state_bucket\s*=\s*"hub-terraform-state-' terraform.tfvars || \
	  (echo "ERROR: shared_state_bucket is a placeholder — set to hub-terraform-state-110844251073" && exit 1)
	@grep -q 'cognito_domain_prefix\s*=\s*"getcumbre-prd"' terraform.tfvars || \
	  (echo "ERROR: cognito_domain_prefix must be 'getcumbre-prd' — wrong value breaks Cognito login flow" && exit 1)
	@echo "Validation passed — safe to apply."

# Live AWS state check (requires aws CLI + credentials).
# Verify that getcumbre.com is correctly wired across all four resources.
check-live:
	@echo "=== ALB listener host header ==="
	@aws elbv2 describe-rules --region us-east-1 \
	  --listener-arn $$(aws elbv2 describe-listeners --region us-east-1 \
	    --load-balancer-arn $$(aws elbv2 describe-load-balancers --region us-east-1 \
	      --names hub-prd --query 'LoadBalancers[0].LoadBalancerArn' --output text) \
	    --query 'Listeners[?Port==`443`].ListenerArn' --output text) \
	  --query 'Rules[?Priority!=`default`].Conditions[0].Values[0]' --output text
	@echo "=== Cognito callback URLs ==="
	@aws cognito-idp describe-user-pool-client --region us-east-1 \
	  --user-pool-id us-east-1_ZOHBd9Q74 --client-id 6ds64cbd9kb8e5jvgqg0lrkgm7 \
	  --query 'UserPoolClient.CallbackURLs' --output text
	@echo "=== S3 CORS allowed origins ==="
	@aws s3api get-bucket-cors --region us-east-1 \
	  --bucket hub-cumbre-prd-uploads-110844251073 \
	  --query 'CORSRules[0].AllowedOrigins' --output text
