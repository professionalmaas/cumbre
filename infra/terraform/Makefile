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
	@echo "Validation passed."
