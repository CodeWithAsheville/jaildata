import { APIGatewayProxyEvent } from "aws-lambda";
import { get } from "../status";

// Mock the environment variables
process.env.STAGE = "test";

describe("Status Handler", () => {
    it("should return status information", async () => {
        const mockEvent = {} as APIGatewayProxyEvent;

        const result = await get(mockEvent);

        expect(result.statusCode).toBe(200);

        const body = JSON.parse(result.body);
        expect(body).toHaveProperty("status", "healthy");
        expect(body).toHaveProperty("service", "detention-data-api");
        expect(body).toHaveProperty("environment", "test");
        expect(body).toHaveProperty("timestamp");
        expect(body).toHaveProperty("version", "1.0.0");
    });

    it("should return timestamp as valid ISO string", async () => {
        const mockEvent = {} as APIGatewayProxyEvent;

        const result = await get(mockEvent);
        const body = JSON.parse(result.body);

        expect(() => new Date(body.timestamp)).not.toThrow();
        expect(new Date(body.timestamp)).toBeInstanceOf(Date);
    });

    it("should handle missing environment variables", async () => {
        const originalStage = process.env.STAGE;
        delete process.env.STAGE;

        const mockEvent = {} as APIGatewayProxyEvent;
        const result = await get(mockEvent);
        const body = JSON.parse(result.body);

        expect(body.environment).toBe("unknown");

        // Restore environment variable
        if (originalStage) {
            process.env.STAGE = originalStage;
        }
    });
});
