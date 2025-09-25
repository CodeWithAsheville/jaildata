# JailData

A data collection and monitoring system for tracking county jail populations in North Carolina. This system collects day-over-day changes to identify how long people are in the system and proactively support bail assistance and prevent failures-to-appear charges.

## Purpose

This project aims to:

-   Track length of stay for individuals in county detention facilities
-   Identify candidates for bail assistance programs
-   Prevent failures-to-appear charges when someone has charges in one county while detained in another
-   Provide data-driven insights for criminal justice reform

## Architecture

In this project, Serverless Framework handles most infrastructure (DynamoDB, SNS, Lambda) while Terraform manages only the foundational elements.

### Infrastructure (`/infra/terraform/`)

-   **Bootstrap**: IAM setup for GitHub Actions CI/CD
-   **Main**: Alert email parameter and S3 buckets
-   **Dev/Prod**: Environment-specific configurations

### Backend API (`/serverless/`)

-   **Serverless Framework**: AWS Lambda functions, API Gateway, DynamoDB tables, and SNS alerts
-   **DynamoDB**: Primary data store with global secondary indexes (GSIs) for efficient querying
-   **Scheduled Collection**: Daily data collection from county sources
-   **REST API**: Authenticated endpoints for data access

## Data Model

The primary DynamoDB table uses a single-table design:

-   **Primary Key**: `detaineeId` (partition) + `timestamp` (sort)
-   **GSI 1**: `status` + `createdDate` - for active/inactive queries
-   **GSI 2**: `createdDate` + `timestamp` - for time-based analysis

## Quick Start

### Prerequisites

-   AWS CLI configured
-   Node.js 20.x
-   Terraform
-   Domain name for API endpoints

### 1. Bootstrap AWS Infrastructure

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
```

### 2. Deploy Minimal Terraform Infrastructure

```bash
cd ../dev  # or ../prod
terraform init
terraform plan
terraform apply
```

### 3. Deploy API and DynamoDB Infrastructure

```bash
cd ../../serverless
npm install
cd api
npx serverless deploy --stage dev
```

## Configuration

### Adding County Data Sources

To add a new county data collection schedule, edit `serverless/api/serverless.yml`:

```yaml
functions:
    dataCollection:
        events:
            - schedule:
                  rate: cron(30 10 * * ? *)
                  input: '{"countyId": "new-county", "source": "new-county-portal"}'
```

### Environment Variables

The system uses AWS Systems Manager Parameter Store for configuration:

-   `/jaildata/alert-email` - Email address for system alerts (set manually)
-   `/jaildata/alert-topic-arn` - SNS topic ARN for system alerts (set by Serverless Framework)

## Development

### Running Tests

```bash
cd serverless
npm test
```

### Local Development

```bash
cd serverless
npm run lint
cd api
npx serverless offline
```

### Adding New Counties

1. Add schedule configuration in `serverless.yml`
2. Implement county-specific data collection logic in `handlers/data-collection.ts`
3. Test with manual API calls before deploying scheduled version

## Data Privacy and Ethics

This project is designed with privacy and justice reform in mind:

-   No personal identifying information beyond what's publicly available
-   Data used solely for advocacy and bail assistance
-   Secure API access with authentication

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

[LICENSE](LICENSE)
