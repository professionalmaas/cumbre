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

# DR provider — cross-region backup copies land in us-west-2
provider "aws" {
  alias  = "dr"
  region = "us-west-2"

  default_tags {
    tags = {
      Team        = "certus"
      App         = "cumbre"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
