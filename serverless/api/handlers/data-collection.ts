import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  ScheduledEvent,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface JailDataEvent {
  countyId: string;
  source: string;
}

interface DetentionRecord {
  detaineeId: string;
  timestamp: string;
  status: "ACTIVE" | "INACTIVE";
  createdDate: string;
  countyId: string;
  source: string;
  // Add other fields as needed
  firstName?: string;
  lastName?: string;
  bookingDate?: string;
  charges?: string[];
  ttl?: number;
}

export const execute = async (
  event: ScheduledEvent | APIGatewayProxyEvent
): Promise<APIGatewayProxyResult | void> => {
  try {
    console.log("Data collection started", JSON.stringify(event, null, 2));

    // Parse input from scheduled event or API Gateway
    let inputData: JailDataEvent;

    if ("source" in event && event.source === "aws.events") {
      // Scheduled event
      const scheduledEvent = event as ScheduledEvent;
      inputData = JSON.parse(
        scheduledEvent.detail ? JSON.stringify(scheduledEvent.detail) : "{}"
      );
    } else {
      // API Gateway event (for manual testing)
      const apiEvent = event as APIGatewayProxyEvent;
      inputData = JSON.parse(apiEvent.body || "{}");
    }

    const { countyId, source } = inputData;

    if (!countyId || !source) {
      const error = "Missing required parameters: countyId and source";
      console.error(error);

      if ("httpMethod" in event) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error }),
        };
      }
      return;
    }

    // TODO: Implement actual data collection logic
    // This is a stub that would be replaced with real county data scraping
    const mockData = await collectJailData(countyId, source);

    // Store the collected data
    const results = await Promise.all(
      mockData.map((record) => storeDetentionRecord(record))
    );

    console.log(
      `Successfully processed ${results.length} records for ${countyId}`
    );

    if ("httpMethod" in event) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Successfully processed ${results.length} records`,
          countyId,
          source,
        }),
      };
    }
  } catch (error) {
    console.error("Error in data collection:", error);

    if ("httpMethod" in event) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      };
    }
    throw error;
  }
};

async function collectJailData(
  countyId: string,
  source: string
): Promise<DetentionRecord[]> {
  // This is a stub - replace with actual data collection logic
  console.log(`Collecting data for county: ${countyId}, source: ${source}`);

  // Mock data for demonstration
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const timestamp = now.toISOString();

  return [
    {
      detaineeId: `${countyId}-${Date.now()}-001`,
      timestamp,
      status: "ACTIVE",
      createdDate: today,
      countyId,
      source,
      firstName: "John",
      lastName: "Doe",
      bookingDate: today,
      charges: ["DWI", "Traffic Violation"],
      ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year TTL
    },
  ];
}

async function storeDetentionRecord(record: DetentionRecord): Promise<void> {
  const params = {
    TableName: process.env.JAILDATA_TABLE!,
    Item: record,
  };

  await docClient.send(new PutCommand(params));
  console.log(`Stored record for detainee: ${record.detaineeId}`);
}
