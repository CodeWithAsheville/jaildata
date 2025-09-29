import { SQSEvent, SQSRecord } from "aws-lambda";
import AlertService, { AlertCategory } from "../../lib/AlertService";
import StorageClient from "../../lib/StorageClient";
import { BatchProcessingMessage } from "../../lib/types";

const alertService = AlertService.forCategory(AlertCategory.BATCH_PROCESSING);

export const processBatch = async (event: SQSEvent): Promise<void> => {
    try {
        await alertService.info(
            `Processing ${event.Records.length} batch messages`
        );

        // Process each SQS record (batch message)
        const results = await Promise.allSettled(
            event.Records.map((record) => processSingleBatch(record))
        );

        // Count successes and failures
        const successes = results.filter(
            (r) => r.status === "fulfilled"
        ).length;
        const failures = results.filter((r) => r.status === "rejected").length;

        if (failures > 0) {
            await alertService.warn(
                `Batch processing completed with ${failures} failures out of ${results.length} batches`
            );

            // Log specific failure details
            results.forEach((result, index) => {
                if (result.status === "rejected") {
                    alertService.error(
                        `Batch ${index} processing failed`,
                        result.reason as Error
                    );
                }
            });
        } else {
            await alertService.info(
                `Successfully processed ${successes} batches`
            );
        }
    } catch (error) {
        await alertService.error(
            `Batch processing handler failed: ${error}`,
            error as Error
        );
        throw error;
    }
};

async function processSingleBatch(record: SQSRecord): Promise<void> {
    try {
        const batchMessage: BatchProcessingMessage = JSON.parse(record.body);

        // Validate required fields
        if (!batchMessage.facilityId) {
            throw new Error("Missing facilityId in batch message");
        }

        if (!batchMessage.batch || !Array.isArray(batchMessage.batch.Inmates)) {
            throw new Error("Invalid batch structure in message");
        }

        await alertService.info(
            `Processing batch ${batchMessage.batchNumber} for facility ${batchMessage.facilityId} with ${batchMessage.batch.Inmates.length} inmates`
        );

        // Process all inmates in the batch using StorageClient batch operation
        await StorageClient.batchSaveInmates(
            batchMessage.facilityId,
            batchMessage.batch.Inmates
        );

        await alertService.info(
            `Successfully processed ${batchMessage.batch.Inmates.length} inmates from batch ${batchMessage.batchNumber} for facility ${batchMessage.facilityId}`
        );
    } catch (error) {
        await alertService.error(
            `Failed to process batch: ${error}`,
            error as Error
        );
        throw error;
    }
}
