import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const get = async (
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Basic health check
    const status = {
      service: "detention-data-api",
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.STAGE || "unknown",
      version: "1.0.0",
    };

    return {
      statusCode: 200,
      body: JSON.stringify(status),
    };
  } catch (error) {
    console.error("Error in status check:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        service: "jaildata-api",
        status: "unhealthy",
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
