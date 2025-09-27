provider "aws" {
  region = var.aws_region
}

# Create IAM user for GitHub Actions
resource "aws_iam_user" "github_actions" {
  name = "github-actions-jaildata"
  path = "/service-accounts/"

  tags = {
    Description = "Service account for GitHub Actions CI/CD pipelines"
    Service     = "JailData"
    ManagedBy   = "Terraform"
  }
}

# IAM policy for GitHub Actions
resource "aws_iam_policy" "github_actions_policy" {
  name        = "JailDataGitHubActionsPolicy"
  description = "Policy that grants permissions needed for JailData GitHub Actions workflows"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # S3 permissions for Terraform state and Serverless deployment
      {
        Effect = "Allow"
        Action = [
          "s3:*"
        ]
        Resource = [
          "arn:aws:s3:::jaildata-tf-state-*",
          "arn:aws:s3:::jaildata-tf-state-*/*",
          "arn:aws:s3:::serverless-framework-state-*",
          "arn:aws:s3:::serverless-framework-state-*/*",
          "arn:aws:s3:::jaildata-serverless-deployments-*",
          "arn:aws:s3:::jaildata-serverless-deployments-*/*"
        ]
      },

      # S3 bucket creation permissions
      {
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:ListAllMyBuckets",
          "s3:HeadBucket"
        ]
        Resource = "*"
      },

      # CloudFormation permissions for Serverless Framework
      {
        Effect = "Allow"
        Action = [
          "cloudformation:*"
        ]
        Resource = "*"
      },

      # SSM Parameter Store permissions
      {
        Effect = "Allow"
        Action = [
          "ssm:*"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:*:parameter/jaildata/*",
          "arn:aws:ssm:us-east-1:*:parameter/jaildata/*"
        ]
      },

      # Serverless Framework SSM permissions
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:PutParameter"
        ]
        Resource = [
          "arn:aws:ssm:us-east-1:*:parameter/serverless-framework/*",
          "arn:aws:ssm:${var.aws_region}:*:parameter/serverless-framework/*"
        ]
      },

      # Additional SSM permissions for DescribeParameters (requires * resource)
      {
        Effect = "Allow"
        Action = [
          "ssm:DescribeParameters"
        ]
        Resource = "*"
      },

      # DynamoDB permissions for Terraform state locking and application tables
      {
        Effect = "Allow"
        Action = [
          "dynamodb:*"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:*:table/terraform-state-lock",
          "arn:aws:dynamodb:${var.aws_region}:*:table/jaildata-*"
        ]
      },

      # Lambda permissions for Serverless Framework
      {
        Effect = "Allow"
        Action = [
          "lambda:*"
        ]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:*:function:jaildata-*",
          "arn:aws:lambda:${var.aws_region}:*:function:api-*"
        ]
      },

      # API Gateway permissions for Serverless Framework
      {
        Effect = "Allow"
        Action = [
          "apigateway:*"
        ]
        Resource = "*"
      },

      # IAM permissions for Serverless Framework
      {
        Effect = "Allow"
        Action = [
          "iam:*"
        ]
        Resource = [
          "arn:aws:iam::*:role/jaildata-*",
          "arn:aws:iam::*:role/api-*"
        ]
      },

      # Additional IAM permissions for managed policies
      {
        Effect = "Allow"
        Action = [
          "iam:ListPolicies",
          "iam:ListEntitiesForPolicy",
          "iam:GetPolicy"
        ]
        Resource = "arn:aws:iam::aws:policy/service-role/*"
      },

      # CloudWatch Logs permissions for Serverless Framework
      {
        Effect = "Allow"
        Action = [
          "logs:*"
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/jaildata-*",
          "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/jaildata-*:*",
          "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/api-*",
          "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/api-*:*"
        ]
      },

      # CloudWatch Metrics and Events permissions
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:DeleteAlarms",
          "cloudwatch:GetMetricData",
          "cloudwatch:ListMetrics",
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      },

      # EventBridge/CloudWatch Events permissions for scheduled Lambda
      {
        Effect = "Allow"
        Action = [
          "events:*"
        ]
        Resource = "*"
      },

      # Route53 permissions (if needed for custom domains)
      {
        Effect = "Allow"
        Action = [
          "route53:*"
        ]
        Resource = "*"
      },

      # ACM Certificate permissions
      {
        Effect = "Allow"
        Action = [
          "acm:*"
        ]
        Resource = "*"
      },

      # KMS permissions for Serverless Framework
      {
        Effect = "Allow"
        Action = [
          "kms:*"
        ]
        Resource = "*"
      },

      # SNS permissions for alerts
      {
        Effect = "Allow"
        Action = [
          "sns:*"
        ]
        Resource = "arn:aws:sns:${var.aws_region}:*:jaildata-alerts-*"
      }
    ]
  })
}

# Attach the policy to the user
resource "aws_iam_user_policy_attachment" "github_actions_policy_attachment" {
  user       = aws_iam_user.github_actions.name
  policy_arn = aws_iam_policy.github_actions_policy.arn
}

# DynamoDB table for Terraform state locking
resource "aws_dynamodb_table" "terraform_state_lock" {
  name         = "terraform-state-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  deletion_protection_enabled = true

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name      = "Terraform State Lock Table"
    Service   = "JailData"
    ManagedBy = "Terraform"
  }
}

# S3 bucket for Terraform state
resource "aws_s3_bucket" "terraform_state" {
  bucket = "jaildata-tf-state"

  tags = {
    Name      = "JailData Terraform State"
    Service   = "JailData"
    ManagedBy = "Terraform"
  }
}

# Enable versioning on state bucket
resource "aws_s3_bucket_versioning" "terraform_state_versioning" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access on state bucket
resource "aws_s3_bucket_public_access_block" "terraform_state_pab" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable server-side encryption on state bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state_encryption" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Output instructions for creating access keys
output "instructions" {
  value = <<EOT
===========================================================================
  GitHub Actions CI/CD IAM User Setup Complete
===========================================================================

An IAM user named '${aws_iam_user.github_actions.name}' has been created with
the necessary permissions for GitHub Actions workflows.

To complete setup:
1. Sign in to the AWS Management Console
2. Navigate to IAM → Users → ${aws_iam_user.github_actions.name}
3. Select "Security credentials" tab
4. Under "Access keys", click "Create access key"
5. Select "Command Line Interface (CLI)" as use case
6. Click through the wizard to create the access key
7. IMPORTANT: Download or copy the Access Key ID and Secret Access Key
   These will ONLY be shown once!
8. Add these as environment secrets in your GitHub repository:
   - AWS_ACCESS_KEY_ID
   - AWS_SECRET_ACCESS_KEY

===========================================================================
EOT
}

# Output the created S3 bucket name
output "terraform_state_bucket" {
  description = "S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.bucket
}

# Output the DynamoDB table name
output "terraform_state_lock_table" {
  description = "DynamoDB table for Terraform state locking"
  value       = aws_dynamodb_table.terraform_state_lock.name
}