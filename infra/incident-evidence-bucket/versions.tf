terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.40.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project    = "LingoLinq"
      Purpose    = "incident-evidence"
      ManagedBy  = "terraform"
      Compliance = "breach-runbook-4.1-step-4"
    }
  }
}
