import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const get = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const detaineeId = event.pathParameters?.detaineeId;

    if (!detaineeId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing detaineeId parameter" }),
      };
    }

    const params = {
      TableName: process.env.JAILDATA_TABLE!,
      KeyConditionExpression: "detaineeId = :detaineeId",
      ExpressionAttributeValues: {
        ":detaineeId": detaineeId,
      },
      ScanIndexForward: false, // Most recent first
      Limit: 10, // Get last 10 records
    };

    const result = await docClient.send(new QueryCommand(params));

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Detainee not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        detaineeId,
        records: result.Items,
        count: result.Items.length,
      }),
    };
  } catch (error) {
    console.error("Error getting detainee:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

export const listActive = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const limit = event.queryStringParameters?.limit
      ? parseInt(event.queryStringParameters.limit)
      : 100;
    const daysBack = event.queryStringParameters?.days
      ? parseInt(event.queryStringParameters.days)
      : 7;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(
      endDate.getTime() - daysBack * 24 * 60 * 60 * 1000
    );
    const startDateStr = startDate.toISOString().split("T")[0];

    const params = {
      TableName: process.env.JAILDATA_TABLE!,
      IndexName: "StatusCreatedDateIndex",
      KeyConditionExpression: "#status = :status AND createdDate >= :startDate",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": "ACTIVE",
        ":startDate": startDateStr,
      },
      ScanIndexForward: false, // Most recent first
      Limit: limit,
    };

    const result = await docClient.send(new QueryCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        activeDetainees: result.Items || [],
        count: result.Items?.length || 0,
        dateRange: {
          start: startDateStr,
          end: endDate.toISOString().split("T")[0],
        },
      }),
    };
  } catch (error) {
    console.error("Error listing active detainees:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
