# Remote state backend — S3 bucket must exist before terraform init.
# Create it once: aws s3 mb s3://<state_bucket> --region us-east-1
#                 aws s3api put-bucket-versioning --bucket <state_bucket> \
#                   --versioning-configuration Status=Enabled
#
# State key is app-scoped so it never conflicts with the shared layer.
terraform {
  backend "s3" {
    # Override with: terraform init -backend-config="bucket=certus-terraform-state-123456789012"
    # Or set TF_VAR_state_bucket / pass -backend-config on init.
    # Default filled from terraform.tfvars (cannot use variable references in backend block).
    bucket = "certus-terraform-state-ACCOUNT_ID_PLACEHOLDER"
    key    = "cumbre/prd/terraform.tfstate"
    region = "us-east-1"
    # Recommended: enable encryption + lock
    encrypt        = true
    use_lockfile   = true
  }
}
