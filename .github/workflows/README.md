# GitHub Workflows

This directory contains GitHub Actions workflow- `/jaildata/alert-email` - Email for system notifications for the Detention Data project CI/CD pipeline.

## Workflows

### `deploy.yml` - Automated Deployment

Triggers on pushes to `main` (dev) and `live` (prod) branches.

**Jobs:**

1. **Determine Environment** - Maps branch to environment
2. **Verify SSM Parameters** - Ensures required parameters exist
3. **Terraform Apply** - Deploys infrastructure changes
4. **Deploy Backend** - Deploys the API using Serverless Framework
5. **Create Release** - Creates GitHub release for prod deployments

### `pr-checks.yml` - Pull Request Validation

Triggers on pull requests to `main` and `live` branches.

**Jobs:**

1. **Backend Tests** - Runs tests, linting, and TypeScript compilation
2. **Terraform Plan (Dev)** - Shows infrastructure changes for PRs to main
3. **Terraform Plan (Prod)** - Shows infrastructure changes for PRs to live

### `manual-deploy.yml` - Manual Deployment Control

Workflow dispatch for manual deployments with configurable options.

**Inputs:**

-   `branch` - Branch to deploy from
-   `environment` - Target environment (dev/prod)
-   `deploy_backend` - Whether to deploy the API
-   `terraform_apply` - Whether to apply Terraform changes

### `manual-test.yml` - Manual Test Execution

Workflow dispatch for running tests on any branch.

**Features:**

-   Full test suite execution
-   Code linting
-   TypeScript compilation check
-   Test coverage reporting

## Required Secrets

Configure these in your GitHub repository settings:

-   `AWS_ACCESS_KEY_ID` - AWS access key for GitHub Actions user
-   `AWS_SECRET_ACCESS_KEY` - AWS secret key for GitHub Actions user

## Required Variables

Configure these in your repository environments (dev/prod):

-   `ALERT_EMAIL` - Email address for system alerts

## Required SSM Parameters

These must be configured in AWS Systems Manager Parameter Store:

-   `/detention-data/alert-email` - Email for system notifications

## Branch Strategy

-   `main` - Development environment
-   `live` - Production environment
-   Feature branches - Create PRs to main or live

## Setup Instructions

1. **Bootstrap AWS Infrastructure:**

    ```bash
    cd infra/terraform/bootstrap
    terraform apply
    ```

2. **Configure GitHub Secrets:**

    - Add AWS credentials from bootstrap output
    - Configure repository variables for each environment

3. **Set SSM Parameters:**

    ```bash
    aws ssm put-parameter --name "/jaildata/alert-email" --value "your-email@domain.com" --type "SecureString"
    ```

4. **Deploy Infrastructure:**
   Push to `main` branch or use manual deploy workflow

## Deployment Process

### Automatic (Recommended)

1. Create feature branch
2. Make changes
3. Open PR to `main` (dev) or `live` (prod)
4. Review Terraform plan in PR comments
5. Merge PR to trigger deployment

### Manual

1. Use "Manual Deploy" workflow from Actions tab
2. Select branch, environment, and components
3. Monitor deployment progress

## Monitoring

-   Check CloudWatch logs for Lambda functions
-   Monitor DynamoDB metrics
-   Set up CloudWatch alarms based on application metrics
-   Review GitHub Actions logs for deployment issues
