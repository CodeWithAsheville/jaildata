import { APIGatewayProxyEvent, ScheduledEvent } from "aws-lambda";

// Mock external dependencies using ZipCase pattern BEFORE importing the module
jest.mock("axios");

// Mock AWS SDK clients
const mockSQSSend = jest.fn();
const mockSSMSend = jest.fn();

jest.mock("@aws-sdk/client-sqs", () => ({
    SQSClient: jest.fn().mockImplementation(() => ({
        send: mockSQSSend,
    })),
    SendMessageCommand: jest.fn(),
}));

jest.mock("@aws-sdk/client-ssm", () => ({
    SSMClient: jest.fn().mockImplementation(() => ({
        send: mockSSMSend,
    })),
    GetParameterCommand: jest.fn(),
}));

jest.mock("uuid", () => ({
    v4: jest.fn(() => "mock-uuid-123"),
}));

// Mock AlertService
jest.mock("../../../lib/AlertService", () => ({
    __esModule: true,
    default: {
        forCategory: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
    },
    AlertCategory: {
        DATA_COLLECTION: "DATA_COLLECTION",
    },
}));

// Mock FacilityMapping
jest.mock("../../../lib/FacilityMapping", () => ({
    FacilityMapper: {
        loadApiIds: jest.fn(),
        getFacilityByName: jest.fn(),
    },
}));

// Import axios after mocking
import axios from "axios";
const mockedAxios = axios as jest.Mocked<typeof axios>;

import { collect, collectScheduled } from "../data-collection";
import { FacilityMapper } from "../../../lib/FacilityMapping";
const mockFacilityMapper = FacilityMapper as jest.Mocked<typeof FacilityMapper>;

// Helper functions for test events
const createMockEvent = (
    facilityId?: string,
    body?: string
): APIGatewayProxyEvent => ({
    pathParameters: facilityId ? { facilityId } : null,
    body: body || null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: "POST",
    isBase64Encoded: false,
    path: `/collect/${facilityId}`,
    resource: "/collect/{facilityId}",
    requestContext: {} as any,
    stageVariables: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
});

const createMockScheduledEvent = (facilityId: string): ScheduledEvent => ({
    version: "0",
    id: "scheduled-event-id",
    "detail-type": "Scheduled Event",
    source: "aws.events",
    account: "123456789012",
    time: "2025-09-29T10:00:00Z",
    region: "us-east-1",
    detail: { facilityId },
    resources: ["arn:aws:events:us-east-1:123456789012:rule/test-rule"],
});

describe("Data Collection Handler", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Reset environment variables
        process.env.AWS_REGION = "us-east-1";
        process.env.AWS_ACCOUNT_ID = "123456789012";
        process.env.STAGE = "test";

        // Set up SSM client mock to return successful responses by default
        mockSSMSend.mockResolvedValue({
            Parameter: {
                Value: "https://api.example.com",
            },
        });

        // Set up axios mock
        mockedAxios.create.mockReturnValue({
            get: jest.fn(),
            post: jest.fn(),
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() },
            },
        } as any);

        // Set up default successful facility mapping
        mockFacilityMapper.getFacilityByName.mockReturnValue({
            name: "wake",
            apiId: 384,
            displayName: "Wake County",
        });
    });

    describe("Manual Collection (collect)", () => {
        it("should start data collection successfully", async () => {
            const event = createMockEvent("wake");
            const result = await collect(event);

            expect(result.statusCode).toBe(202);
            const body = JSON.parse(result.body);
            expect(body.message).toBe("Data collection started");
            expect(body.facilityId).toBe("wake");
            expect(mockSSMSend).toHaveBeenCalledTimes(1);
        });

        it("should return 400 for missing facilityId", async () => {
            const event = createMockEvent();
            const result = await collect(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("facilityId is required");
            expect(mockSSMSend).not.toHaveBeenCalled();
        });

        it("should handle facilityId from request body", async () => {
            const event = createMockEvent(
                undefined,
                JSON.stringify({ facilityId: "buncombe" })
            );
            const result = await collect(event);

            expect(result.statusCode).toBe(202);
            const body = JSON.parse(result.body);
            expect(body.facilityId).toBe("buncombe");
        });

        it("should handle unknown facility", async () => {
            mockFacilityMapper.getFacilityByName.mockReturnValueOnce(null);

            const event = createMockEvent("unknown");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
            expect(body.message).toBe("Unknown facility: unknown");
        });

        it("should handle facility without API ID", async () => {
            mockFacilityMapper.getFacilityByName.mockReturnValueOnce({
                name: "mecklenburg",
                apiId: 0,
                displayName: "Mecklenburg County",
            });

            const event = createMockEvent("mecklenburg");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
            expect(body.message).toBe(
                "Facility mecklenburg does not have a configured API ID"
            );
        });

        it("should handle SSM parameter not found", async () => {
            mockSSMSend.mockResolvedValueOnce({
                Parameter: null,
            });

            const event = createMockEvent("wake");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
        });

        it("should handle SSM parameter missing value", async () => {
            mockSSMSend.mockResolvedValueOnce({
                Parameter: {
                    Value: null,
                },
            });

            const event = createMockEvent("wake");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
        });

        it("should handle SSM client errors", async () => {
            mockSSMSend.mockRejectedValueOnce(new Error("SSM Error"));

            const event = createMockEvent("wake");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
        });

        it("should handle malformed JSON in request body", async () => {
            const event = createMockEvent(undefined, "invalid json");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
        });
    });

    describe("Scheduled Collection (collectScheduled)", () => {
        it("should process scheduled collection and handle initialization", async () => {
            const event = createMockScheduledEvent("wake");

            // The scheduled function should call the DataCollectionService which will attempt
            // to initialize the session. Since we can't easily mock the full session flow,
            // we expect it to fail with the XSRF token error which means it got past
            // the facility validation and SSM parameter retrieval
            await expect(collectScheduled(event)).rejects.toThrow(
                "Failed to obtain XSRF token from initial request"
            );

            expect(mockSSMSend).toHaveBeenCalledTimes(1);
        });

        it("should handle missing facilityId in event detail", async () => {
            const event: ScheduledEvent = {
                ...createMockScheduledEvent("wake"),
                detail: {},
            };

            await expect(collectScheduled(event)).rejects.toThrow(
                "facilityId is required in event input"
            );
        });

        it("should handle unknown facility in scheduled event", async () => {
            mockFacilityMapper.getFacilityByName.mockReturnValueOnce(null);

            const event = createMockScheduledEvent("unknown");

            await expect(collectScheduled(event)).rejects.toThrow(
                "Unknown facility: unknown"
            );
        });

        it("should handle facility without API ID in scheduled event", async () => {
            mockFacilityMapper.getFacilityByName.mockReturnValueOnce({
                name: "mecklenburg",
                apiId: 0,
                displayName: "Mecklenburg County",
            });

            const event = createMockScheduledEvent("mecklenburg");

            await expect(collectScheduled(event)).rejects.toThrow(
                "Facility mecklenburg does not have a configured API ID"
            );
        });

        it("should handle SSM errors in scheduled collection", async () => {
            mockSSMSend.mockRejectedValueOnce(new Error("SSM Error"));

            const event = createMockScheduledEvent("wake");

            await expect(collectScheduled(event)).rejects.toThrow("SSM Error");
        });

        it("should handle SSM parameter not found", async () => {
            mockSSMSend.mockResolvedValueOnce({
                Parameter: null,
            });

            const event = createMockScheduledEvent("wake");

            await expect(collectScheduled(event)).rejects.toThrow(
                "Base URL not configured in SSM Parameter Store"
            );
        });
    });

    describe("Configuration and Validation", () => {
        it("should validate facilityId parameter before SSM call", async () => {
            const event = createMockEvent("wake");
            await collect(event);

            expect(mockFacilityMapper.getFacilityByName).toHaveBeenCalledWith(
                "wake"
            );
            expect(mockSSMSend).toHaveBeenCalledTimes(1);
        });

        it("should create axios instance with proper configuration", async () => {
            const event = createMockEvent("wake");
            await collect(event);

            expect(mockedAxios.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseURL: "https://api.example.com",
                    timeout: 30000,
                    headers: expect.objectContaining({
                        "User-Agent": "Mozilla/5.0 (compatible; JailData/1.0)",
                        Accept: "application/json, text/plain, */*",
                        "Accept-Language": "en-US,en;q=0.9",
                    }),
                })
            );
        });

        it("should set up axios interceptors for cookie handling", async () => {
            const event = createMockEvent("wake");
            await collect(event);

            const axiosInstance = mockedAxios.create.mock.results[0].value;
            expect(axiosInstance.interceptors.request.use).toHaveBeenCalled();
            expect(axiosInstance.interceptors.response.use).toHaveBeenCalled();
        });
    });

    describe("Error Handling", () => {
        it("should handle unexpected errors gracefully", async () => {
            // Force an unexpected error by making FacilityMapper throw
            mockFacilityMapper.getFacilityByName.mockImplementationOnce(() => {
                throw new Error("Unexpected error");
            });

            const event = createMockEvent("wake");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
        });

        it("should handle facility mapping service errors", async () => {
            mockFacilityMapper.getFacilityByName.mockImplementationOnce(() => {
                throw new Error("Service unavailable");
            });

            const event = createMockEvent("wake");
            const result = await collect(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Failed to start data collection");
        });
    });
});
