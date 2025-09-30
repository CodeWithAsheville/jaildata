import { APIGatewayProxyEvent } from "aws-lambda";
import {
    getInmatesByFacility,
    getAllActiveInmates,
    searchInmatesByName,
    getSpecificInmate,
} from "../detainee";
import StorageClient from "../../../lib/StorageClient";
import { FacilityMapper } from "../../../lib/FacilityMapping";
import { InmateDynamoRecord } from "../../../lib/types";

// Mock StorageClient
jest.mock("../../../lib/StorageClient", () => ({
    getInmatesByFacility: jest.fn(),
    getAllRecentInmates: jest.fn(),
    searchInmatesByLastName: jest.fn(),
    getInmate: jest.fn(),
}));

// Mock FacilityMapping
jest.mock("../../../lib/FacilityMapping", () => ({
    FacilityMapper: {
        isValidFacilityName: jest.fn(),
        getAllFacilities: jest.fn(),
    },
}));

// Mock AlertService
jest.mock("../../../lib/AlertService", () => ({
    forCategory: jest.fn().mockReturnValue({
        error: jest.fn(),
    }),
    AlertCategory: {
        DATABASE: "DATABASE",
    },
}));

const mockStorageClient = StorageClient as jest.Mocked<typeof StorageClient>;
const mockFacilityMapper = FacilityMapper as jest.Mocked<typeof FacilityMapper>;

describe("Detainee Handler", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFacilityMapper.isValidFacilityName.mockReturnValue(true);
        mockFacilityMapper.getAllFacilities.mockReturnValue([
            { name: "wake", apiId: 384, displayName: "Wake County" },
            { name: "buncombe", apiId: 23, displayName: "Buncombe County" },
        ]);
    });

    const createMockInmate = (
        overrides: Partial<InmateDynamoRecord> = {}
    ): InmateDynamoRecord => ({
        PK: "INMATE#wake#DOE#JOHN#",
        SK: "2025-09-15",
        GSI1PK: "FACILITY#wake",
        GSI1SK: "2025-09-15",
        recordDate: "2025-09-15",
        lastUpdated: "2025-09-15T10:30:00Z",
        totalBondAmount: 1000,
        rawData: { FirstName: "John", LastName: "Doe" },
        ...overrides,
    });

    describe("getInmatesByFacility", () => {
        const createMockEvent = (
            facilityId?: string,
            limit?: string
        ): APIGatewayProxyEvent => ({
            pathParameters: facilityId ? { facilityId } : null,
            queryStringParameters: limit ? { limit } : null,
            body: null,
            headers: {},
            multiValueHeaders: {},
            httpMethod: "GET",
            isBase64Encoded: false,
            path: `/inmates/${facilityId}`,
            resource: "/inmates/{facilityId}",
            requestContext: {} as any,
            stageVariables: null,
            multiValueQueryStringParameters: null,
        });

        it("should return inmates for valid facility", async () => {
            const mockInmates = [createMockInmate()];

            mockStorageClient.getInmatesByFacility.mockResolvedValueOnce(
                mockInmates
            );

            const event = createMockEvent("wake");
            const result = await getInmatesByFacility(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.facilityId).toBe("wake");
            expect(body.inmates).toEqual(mockInmates);
            expect(body.count).toBe(1);
            expect(body.description).toBe("Recent inmates (last 24 hours)");
        });

        it("should return 400 for missing facilityId", async () => {
            const event = createMockEvent();
            const result = await getInmatesByFacility(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Missing facilityId parameter");
        });

        it("should return 400 for invalid facility", async () => {
            mockFacilityMapper.isValidFacilityName.mockReturnValueOnce(false);

            const event = createMockEvent("invalid");
            const result = await getInmatesByFacility(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toContain("Invalid facilityId: invalid");
        });

        it("should use custom limit parameter", async () => {
            mockStorageClient.getInmatesByFacility.mockResolvedValueOnce([]);

            const event = createMockEvent("wake", "50");
            await getInmatesByFacility(event);

            expect(mockStorageClient.getInmatesByFacility).toHaveBeenCalledWith(
                "wake",
                50
            );
        });

        it("should use default limit when not specified", async () => {
            mockStorageClient.getInmatesByFacility.mockResolvedValueOnce([]);

            const event = createMockEvent("wake");
            await getInmatesByFacility(event);

            expect(mockStorageClient.getInmatesByFacility).toHaveBeenCalledWith(
                "wake",
                100
            );
        });

        it("should handle StorageClient errors", async () => {
            mockStorageClient.getInmatesByFacility.mockRejectedValueOnce(
                new Error("Storage error")
            );

            const event = createMockEvent("wake");
            const result = await getInmatesByFacility(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Internal server error");
        });
    });

    describe("getAllActiveInmates", () => {
        const createMockEvent = (limit?: string): APIGatewayProxyEvent => ({
            queryStringParameters: limit ? { limit } : null,
            pathParameters: null,
            body: null,
            headers: {},
            multiValueHeaders: {},
            httpMethod: "GET",
            isBase64Encoded: false,
            path: "/inmates/active",
            resource: "/inmates/active",
            requestContext: {} as any,
            stageVariables: null,
            multiValueQueryStringParameters: null,
        });

        it("should return recent inmates across all facilities", async () => {
            const mockInmates = [
                createMockInmate(),
                createMockInmate({
                    recordDate: "2025-09-14",
                    SK: "2025-09-14",
                }),
            ];

            mockStorageClient.getAllRecentInmates.mockResolvedValueOnce(
                mockInmates
            );

            const event = createMockEvent();
            const result = await getAllActiveInmates(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.inmates).toEqual(mockInmates);
            expect(body.count).toBe(2);
            expect(body.description).toBe("Recent inmates (last 24 hours)");
        });

        it("should use custom limit", async () => {
            mockStorageClient.getAllRecentInmates.mockResolvedValueOnce([]);

            const event = createMockEvent("200");
            await getAllActiveInmates(event);

            expect(mockStorageClient.getAllRecentInmates).toHaveBeenCalledWith(
                200
            );
        });
    });

    describe("searchInmatesByName", () => {
        const createMockEvent = (
            facilityId?: string,
            lastName?: string,
            limit?: string
        ): APIGatewayProxyEvent => ({
            pathParameters: facilityId ? { facilityId } : null,
            queryStringParameters: {
                ...(lastName && { lastName }),
                ...(limit && { limit }),
            },
            body: null,
            headers: {},
            multiValueHeaders: {},
            httpMethod: "GET",
            isBase64Encoded: false,
            path: `/inmates/${facilityId}/search`,
            resource: "/inmates/{facilityId}/search",
            requestContext: {} as any,
            stageVariables: null,
            multiValueQueryStringParameters: null,
        });

        it("should search inmates by last name", async () => {
            const mockInmates = [
                createMockInmate({
                    rawData: { FirstName: "John", LastName: "Smith" },
                }),
            ];

            mockStorageClient.searchInmatesByLastName.mockResolvedValueOnce(
                mockInmates
            );

            const event = createMockEvent("wake", "Smith");
            const result = await searchInmatesByName(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.facilityId).toBe("wake");
            expect(body.searchTerm).toBe("Smith");
            expect(body.inmates).toEqual(mockInmates);
        });

        it("should return 400 for missing lastName", async () => {
            const event = createMockEvent("wake");
            const result = await searchInmatesByName(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Missing lastName query parameter");
        });

        it("should return 400 for invalid facility", async () => {
            mockFacilityMapper.isValidFacilityName.mockReturnValueOnce(false);

            const event = createMockEvent("invalid", "Smith");
            const result = await searchInmatesByName(event);

            expect(result.statusCode).toBe(400);
        });
    });

    describe("getSpecificInmate", () => {
        const createMockEvent = (params: {
            facilityId?: string;
            lastName?: string;
            firstName?: string;
            middleName?: string;
            recordDate?: string;
        }): APIGatewayProxyEvent => ({
            pathParameters: {
                facilityId: params.facilityId || undefined,
                lastName: params.lastName || undefined,
                firstName: params.firstName || undefined,
                middleName: params.middleName || undefined,
                recordDate: params.recordDate || undefined,
            },
            queryStringParameters: null,
            body: null,
            headers: {},
            multiValueHeaders: {},
            httpMethod: "GET",
            isBase64Encoded: false,
            path: "/inmates/wake/DOE/JOHN/2025-09-15",
            resource:
                "/inmates/{facilityId}/{lastName}/{firstName}/{recordDate}",
            requestContext: {} as any,
            stageVariables: null,
            multiValueQueryStringParameters: null,
        });

        it("should return specific inmate", async () => {
            const mockInmate = createMockInmate();

            mockStorageClient.getInmate.mockResolvedValueOnce(mockInmate);

            const event = createMockEvent({
                facilityId: "wake",
                lastName: "Doe",
                firstName: "John",
                recordDate: "2025-09-15",
            });

            const result = await getSpecificInmate(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual(mockInmate);
        });

        it("should return 404 when inmate not found", async () => {
            mockStorageClient.getInmate.mockResolvedValueOnce(null);

            const event = createMockEvent({
                facilityId: "wake",
                lastName: "Doe",
                firstName: "John",
                recordDate: "2025-09-15",
            });

            const result = await getSpecificInmate(event);

            expect(result.statusCode).toBe(404);
            const body = JSON.parse(result.body);
            expect(body.error).toBe("Inmate not found");
        });

        it("should return 400 for missing required parameters", async () => {
            const event = createMockEvent({
                facilityId: "wake",
                // Missing lastName, firstName, recordDate
            });

            const result = await getSpecificInmate(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe(
                "Missing required parameters: facilityId, lastName, firstName, recordDate"
            );
        });

        it("should handle middle name parameter", async () => {
            const mockInmate = createMockInmate({
                rawData: {
                    FirstName: "John",
                    LastName: "Doe",
                    MiddleName: "M",
                },
            });

            mockStorageClient.getInmate.mockResolvedValueOnce(mockInmate);

            const event = createMockEvent({
                facilityId: "wake",
                lastName: "Doe",
                firstName: "John",
                middleName: "M",
                recordDate: "2025-09-15",
            });

            await getSpecificInmate(event);

            expect(mockStorageClient.getInmate).toHaveBeenCalledWith(
                "wake",
                "Doe",
                "John",
                "M",
                "2025-09-15"
            );
        });
    });
});
