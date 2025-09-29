import { SQSEvent, SQSRecord } from "aws-lambda";
import { processBatch } from "../batch-processing";
import StorageClient from "../../../lib/StorageClient";

// Mock StorageClient
jest.mock("../../../lib/StorageClient", () => ({
    batchSaveInmates: jest.fn(),
}));

// Mock AlertService
jest.mock("../../../lib/AlertService", () => ({
    forCategory: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
    AlertCategory: {
        BATCH_PROCESSING: "BATCH_PROCESSING",
    },
}));

const mockStorageClient = StorageClient as jest.Mocked<typeof StorageClient>;

describe("Batch Processing Handler", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createMockSQSRecord = (
        facilityId: string,
        batchNumber: number,
        inmates: any[]
    ): SQSRecord => ({
        messageId: `message-${batchNumber}`,
        receiptHandle: "receipt-handle",
        body: JSON.stringify({
            facilityId,
            batch: {
                Inmates: inmates,
                Total: inmates.length,
                ShowImages: false,
            },
            batchNumber,
            totalBatches: 1,
            requestId: "test-request-id",
        }),
        attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1234567890",
            SenderId: "sender-id",
            ApproximateFirstReceiveTimestamp: "1234567890",
        },
        messageAttributes: {},
        md5OfBody: "md5-hash",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-queue",
        awsRegion: "us-east-1",
    });

    it("should process a single batch successfully", async () => {
        const inmates = [
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

        const sqsEvent: SQSEvent = {
            Records: [createMockSQSRecord("wake", 1, inmates)],
        };

        mockStorageClient.batchSaveInmates.mockResolvedValueOnce(undefined);

        await processBatch(sqsEvent);

        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledTimes(1);
        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledWith(
            "wake",
            inmates
        );
    });

    it("should process multiple batches", async () => {
        const inmates1 = [
            {
                FirstName: "John",
                LastName: "Doe",
                ArrestDate: "9/15/2025 10:30:00 AM",
            },
        ];
        const inmates2 = [
            {
                FirstName: "Jane",
                LastName: "Smith",
                ArrestDate: "9/16/2025 11:00:00 AM",
            },
        ];

        const sqsEvent: SQSEvent = {
            Records: [
                createMockSQSRecord("wake", 1, inmates1),
                createMockSQSRecord("buncombe", 2, inmates2),
            ],
        };

        mockStorageClient.batchSaveInmates.mockResolvedValue(undefined);

        await processBatch(sqsEvent);

        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledTimes(2);
        expect(mockStorageClient.batchSaveInmates).toHaveBeenNthCalledWith(
            1,
            "wake",
            inmates1
        );
        expect(mockStorageClient.batchSaveInmates).toHaveBeenNthCalledWith(
            2,
            "buncombe",
            inmates2
        );
    });

    it("should handle empty batch gracefully", async () => {
        const sqsEvent: SQSEvent = {
            Records: [createMockSQSRecord("wake", 1, [])],
        };

        mockStorageClient.batchSaveInmates.mockResolvedValueOnce(undefined);

        await processBatch(sqsEvent);

        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledTimes(1);
        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledWith(
            "wake",
            []
        );
    });

    it("should continue processing other batches when one fails", async () => {
        const inmates1 = [{ FirstName: "John", LastName: "Doe" }];
        const inmates2 = [{ FirstName: "Jane", LastName: "Smith" }];

        const sqsEvent: SQSEvent = {
            Records: [
                createMockSQSRecord("wake", 1, inmates1),
                createMockSQSRecord("buncombe", 2, inmates2),
            ],
        };

        mockStorageClient.batchSaveInmates
            .mockRejectedValueOnce(new Error("Storage error"))
            .mockResolvedValueOnce(undefined);

        await processBatch(sqsEvent);

        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledTimes(2);
    });

    it("should handle malformed SQS message body", async () => {
        const malformedRecord: SQSRecord = {
            ...createMockSQSRecord("wake", 1, []),
            body: "invalid json",
        };

        const sqsEvent: SQSEvent = {
            Records: [malformedRecord],
        };

        await processBatch(sqsEvent);

        expect(mockStorageClient.batchSaveInmates).not.toHaveBeenCalled();
    });

    it("should handle missing facility ID in message", async () => {
        const recordWithoutFacility: SQSRecord = {
            ...createMockSQSRecord("wake", 1, []),
            body: JSON.stringify({
                batch: { Inmates: [], Total: 0, ShowImages: false },
                batchNumber: 1,
                requestId: "test-request-id",
                // Missing facilityId
            }),
        };

        const sqsEvent: SQSEvent = {
            Records: [recordWithoutFacility],
        };

        await processBatch(sqsEvent);

        expect(mockStorageClient.batchSaveInmates).not.toHaveBeenCalled();
    });

    it("should handle large batch with many inmates", async () => {
        // Create a batch with 100 inmates
        const inmates = Array.from({ length: 100 }, (_, i) => ({
            FirstName: `Inmate${i}`,
            LastName: "Test",
            ArrestDate: "9/15/2025 10:30:00 AM",
        }));

        const sqsEvent: SQSEvent = {
            Records: [createMockSQSRecord("wake", 1, inmates)],
        };

        mockStorageClient.batchSaveInmates.mockResolvedValueOnce(undefined);

        await processBatch(sqsEvent);

        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledTimes(1);
        expect(mockStorageClient.batchSaveInmates).toHaveBeenCalledWith(
            "wake",
            inmates
        );
    });
});
