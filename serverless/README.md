# Detention Data API

This is the backend API for the Detention Data project, built with the Serverless Framework and AWS services.

## Architecture

- **AWS Lambda**: Serverless functions for API endpoints and scheduled data collection
- **Amazon DynamoDB**: NoSQL database for storing detention data
- **Amazon API Gateway**: REST API with API key authentication
- **AWS EventBridge**: Scheduled triggers for data collection
- **AWS CloudWatch**: Logging and monitoring

## Project Structure

```
serverless/
├── api/                    # API service
│   ├── handlers/          # Lambda function handlers
│   │   ├── data-collection.ts    # Scheduled data collection
│   │   ├── detainee.ts           # Detainee CRUD operations
│   │   └── status.ts             # Health check endpoint
│   └── serverless.yml     # Serverless configuration
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── eslint.config.js       # ESLint configuration
```

## API Endpoints

- `GET /status` - Health check
- `GET /detainee/{detaineeId}` - Get detainee records
- `GET /detainees/active` - List active detainees

## Scheduled Functions

- **Data Collection**: Runs daily at 10 AM UTC to collect detention data from configured county sources

## Development

1. Install dependencies:

    ```bash
    npm install
    ```

2. Deploy to dev environment:

    ```bash
    npx serverless deploy --stage dev
    ```

3. Run tests:
    ```bash
    npm test
    ```

## Configuration

The scheduled data collection can be configured by adding additional schedule events in `serverless.yml`:

```yaml
functions:
    dataCollection:
        events:
            - schedule:
                  rate: cron(30 10 * * ? *)
                  input: '{"countyId": "mecklenburg", "source": "mecklenburg-county"}'
```
