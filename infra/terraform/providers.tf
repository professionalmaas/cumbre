provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Team        = "certus"
      App         = "cumbre"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
