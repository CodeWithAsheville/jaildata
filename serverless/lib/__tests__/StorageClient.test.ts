// Mock the AWS SDK BEFORE importing StorageClient
const mockDynamoDb = {
    send: jest.fn(),
};

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
    DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue(mockDynamoDb),
    },
    GetCommand: jest.fn().mockImplementation((params) => params),
    PutCommand: jest.fn().mockImplementation((params) => params),
    QueryCommand: jest.fn().mockImplementation((params) => params),
    BatchWriteCommand: jest.fn().mockImplementation((params) => params),
}));

// Now import after mocks are set up
import StorageClient from "../StorageClient";
import { InmateRecord } from "../types";

describe("StorageClient", () => {
    const mockInmate: InmateRecord = {
        FirstName: "John",
        LastName: "Doe",
        MiddleName: "M",
        TotalBondAmount: "1000",
        ArrestDate: "9/15/2025 10:30:00 AM",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Set up environment variables
        process.env.JAILDATA_TABLE = "test-table";
        process.env.AWS_REGION = "us-east-1";
    });

    describe("saveInmate", () => {
        it("should save an inmate record successfully", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({});

            await StorageClient.saveInmate("wake", mockInmate);

            expect(mockDynamoDb.send).toHaveBeenCalledTimes(1);
        });

        it("should handle missing name fields", async () => {
            const incompleteInmate: InmateRecord = {
                TotalBondAmount: "500",
                ArrestDate: "9/15/2025 10:30:00 AM",
            };

            mockDynamoDb.send.mockResolvedValueOnce({});

            await StorageClient.saveInmate("wake", incompleteInmate);

            expect(mockDynamoDb.send).toHaveBeenCalledTimes(1);
        });

        it("should handle string and numeric bond amounts", async () => {
            const inmateWithStringBond = {
                ...mockInmate,
                TotalBondAmount: "1500.50",
            };
            const inmateWithNumericBond = {
                ...mockInmate,
                TotalBondAmount: 2000,
            };

            mockDynamoDb.send.mockResolvedValue({});

            await StorageClient.saveInmate("wake", inmateWithStringBond);
            await StorageClient.saveInmate("wake", inmateWithNumericBond);

            expect(mockDynamoDb.send).toHaveBeenCalledTimes(2);
        });

        it("should throw an error when DynamoDB operation fails", async () => {
            const error = new Error("DynamoDB error");
            mockDynamoDb.send.mockRejectedValueOnce(error);

            await expect(
                StorageClient.saveInmate("wake", mockInmate)
            ).rejects.toThrow();
        });
    });

    describe("getInmatesByFacility", () => {
        it("should return inmates for a facility", async () => {
            const mockItems = [
                {
                    PK: "INMATE#wake#DOE#JOHN#M",
                    SK: "2025-09-15",
                    totalBondAmount: 1000,
                    rawData: mockInmate,
                },
            ];

            mockDynamoDb.send.mockResolvedValueOnce({ Items: mockItems });

            const result = await StorageClient.getInmatesByFacility("wake", 50);

            expect(result).toHaveLength(1);
            expect(mockDynamoDb.send).toHaveBeenCalledTimes(1);
        });

        it("should handle empty results", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({ Items: [] });

            const result = await StorageClient.getInmatesByFacility("wake");

            expect(result).toHaveLength(0);
        });

        it("should use default limit of 100", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({ Items: [] });

            await StorageClient.getInmatesByFacility("wake");

            expect(mockDynamoDb.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    Limit: 100,
                })
            );
        });
    });

    describe("getInmatesByFacilityAndDateRange", () => {
        it("should query with start date only", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({ Items: [] });

            await StorageClient.getInmatesByFacilityAndDateRange(
                "wake",
                "2025-09-01"
            );

            expect(mockDynamoDb.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    KeyConditionExpression:
                        "GSI1PK = :gsi1pk AND GSI1SK >= :startDate",
                    ExpressionAttributeValues: {
                        ":gsi1pk": "FACILITY#wake",
                        ":startDate": "2025-09-01",
                    },
                })
            );
        });

        it("should query with end date only", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({ Items: [] });

            await StorageClient.getInmatesByFacilityAndDateRange(
                "wake",
                undefined,
                "2025-09-30"
            );

            expect(mockDynamoDb.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    KeyConditionExpression:
                        "GSI1PK = :gsi1pk AND GSI1SK <= :endDate",
                    ExpressionAttributeValues: {
                        ":gsi1pk": "FACILITY#wake",
                        ":endDate": "2025-09-30",
                    },
                })
            );
        });

        it("should query with date range", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({ Items: [] });

            await StorageClient.getInmatesByFacilityAndDateRange(
                "wake",
                "2025-09-01",
                "2025-09-30"
            );

            expect(mockDynamoDb.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    KeyConditionExpression:
                        "GSI1PK = :gsi1pk AND GSI1SK BETWEEN :startDate AND :endDate",
                    ExpressionAttributeValues: {
                        ":gsi1pk": "FACILITY#wake",
                        ":startDate": "2025-09-01",
                        ":endDate": "2025-09-30",
                    },
                })
            );
        });
    });

    describe("batchSaveInmates", () => {
        const mockInmates: InmateRecord[] = [
            {
                FirstName: "John",
                LastName: "Doe",
                ArrestDate: "9/15/2025 10:30:00 AM",
            },
            {
                FirstName: "Jane",
                LastName: "Smith",
                ArrestDate: "9/16/2025 11:00:00 AM",
            },
        ];

        it("should batch save multiple inmates", async () => {
            mockDynamoDb.send.mockResolvedValue({});

            await StorageClient.batchSaveInmates("wake", mockInmates);

            expect(mockDynamoDb.send).toHaveBeenCalledTimes(1);
        });

        it("should chunk large batches into groups of 25", async () => {
            // Create 30 inmates to test chunking
            const largeInmateList = Array.from({ length: 30 }, (_, i) => ({
                FirstName: `Inmate${i}`,
                LastName: "Test",
                ArrestDate: "9/15/2025 10:30:00 AM",
            }));

            mockDynamoDb.send.mockResolvedValue({});

            await StorageClient.batchSaveInmates("wake", largeInmateList);

            // Should be called twice: 25 + 5
            expect(mockDynamoDb.send).toHaveBeenCalledTimes(2);
        });

        it("should handle empty inmate array", async () => {
            await StorageClient.batchSaveInmates("wake", []);

            expect(mockDynamoDb.send).not.toHaveBeenCalled();
        });
    });

    describe("searchInmatesByLastName", () => {
        it("should search inmates by last name", async () => {
            const mockItems = [
                {
                    PK: "INMATE#wake#SMITH#JOHN#",
                    SK: "2025-09-15",
                    rawData: { FirstName: "John", LastName: "Smith" },
                },
            ];

            mockDynamoDb.send.mockResolvedValueOnce({ Items: mockItems });

            const result = await StorageClient.searchInmatesByLastName(
                "wake",
                "Smith"
            );

            expect(result).toHaveLength(1);
            expect(mockDynamoDb.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    KeyConditionExpression: "begins_with(PK, :pkPrefix)",
                    ExpressionAttributeValues: {
                        ":pkPrefix": "INMATE#wake#SMITH",
                    },
                })
            );
        });

        it("should convert last name to uppercase for search", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({ Items: [] });

            await StorageClient.searchInmatesByLastName("wake", "smith");

            expect(mockDynamoDb.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    ExpressionAttributeValues: {
                        ":pkPrefix": "INMATE#wake#SMITH",
                    },
                })
            );
        });
    });

    describe("getAllRecentInmates", () => {
        it("should get recent inmates from last 24 hours", async () => {
            mockDynamoDb.send.mockResolvedValueOnce({ Items: [] });

            await StorageClient.getAllRecentInmates(50);

            const call = mockDynamoDb.send.mock.calls[0][0];
            expect(call.KeyConditionExpression).toContain(
                "begins_with(GSI1PK, :facilityPrefix)"
            );
            expect(
                call.ExpressionAttributeValues[":facilityPrefix"]
            ).toBe("FACILITY#");
            expect(call.Limit).toBe(50);
        });
    });

    describe("Date parsing functions", () => {
        // Since parseArrestDate is not exported, we'll test it indirectly through saveInmate
        it("should handle different date formats in saveInmate", async () => {
            const inmateWithStandardDate = {
                FirstName: "John",
                LastName: "Doe",
                ArrestDate: "9/15/2025 10:30:00 AM",
            };

            const inmateWithISODate = {
                FirstName: "Jane",
                LastName: "Doe",
                ArrestDate: "2025-09-15T10:30:00Z",
            };

            const inmateWithNoDate = {
                FirstName: "Bob",
                LastName: "Doe",
            };

            mockDynamoDb.send.mockResolvedValue({});

            await StorageClient.saveInmate("wake", inmateWithStandardDate);
            await StorageClient.saveInmate("wake", inmateWithISODate);
            await StorageClient.saveInmate("wake", inmateWithNoDate);

            expect(mockDynamoDb.send).toHaveBeenCalledTimes(3);
        });
    });
});
