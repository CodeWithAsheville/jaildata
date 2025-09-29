import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { InmateDynamoRecord, InmateRecord } from "./types";

// DynamoDB-specific attributes that should be removed from API responses
const DYNAMO_ATTRIBUTES = ["PK", "SK", "GSI1PK", "GSI1SK"];

/**
 * Removes DynamoDB-specific attributes from an object or array of objects
 * @param data The data to clean
 * @returns Cleaned data without DynamoDB attributes
 */
function removeDynamoAttributes<T>(data: T): T {
    if (!data) {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(removeDynamoAttributes) as unknown as T;
    }

    if (typeof data === "object" && data !== null) {
        const cleanedObject = { ...(data as object) } as Record<
            string,
            unknown
        >;

        // Remove DynamoDB attributes
        DYNAMO_ATTRIBUTES.forEach((attr) => {
            if (attr in cleanedObject) {
                delete cleanedObject[attr];
            }
        });

        // Recursively clean nested objects and arrays
        Object.keys(cleanedObject).forEach((key) => {
            cleanedObject[key] = removeDynamoAttributes(cleanedObject[key]);
        });

        return cleanedObject as T;
    }

    return data;
}

export interface DynamoCompositeKey {
    PK: string;
    SK: string;
}

// Key helper for generating consistent partition and sort keys
export const Key = {
    Inmate: (
        facilityId: string,
        lastName: string,
        firstName: string,
        middleName: string,
        recordDate: string
    ) => ({
        PK: `INMATE#${facilityId}#${cleanNameForKey(
            lastName
        )}#${cleanNameForKey(firstName)}#${cleanNameForKey(middleName)}`,
        SK: recordDate, // Format: M/d/yyyy
    }),

    ErrorCache: (errorKey: string) => ({
        PK: "ERROR_CACHE",
        SK: errorKey,
    }),
};

/**
 * Clean name for use in DynamoDB keys (remove special characters, lowercase)
 */
function cleanNameForKey(name?: string): string {
    return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Determine if an inmate is active based on last updated time
 */
/**
 * Generate GSI1 keys for facility-based queries
 */
function getFacilityGSIKeys(facilityId: string, recordDate: string) {
    return {
        GSI1PK: `FACILITY#${facilityId}`,
        GSI1SK: recordDate, // YYYY-MM-DD format for sorting
    };
}

const ddbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-2",
});
const dynamoDb = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME =
    process.env.JAILDATA_TABLE || `jaildata-${process.env.STAGE || "dev"}`;

/**
 * Get a single item from DynamoDB
 */
async function get<T>(key: DynamoCompositeKey): Promise<T | null> {
    try {
        const result = await dynamoDb.send(
            new GetCommand({
                TableName: TABLE_NAME,
                Key: key,
            })
        );

        if (!result.Item) {
            return null;
        }

        return removeDynamoAttributes(result.Item) as T;
    } catch (error) {
        console.error("Error getting item from DynamoDB:", error);
        throw error;
    }
}

/**
 * Save a single item to DynamoDB
 */
async function save<T extends Record<string, unknown>>(
    key: DynamoCompositeKey,
    item: T
): Promise<void> {
    try {
        const itemToSave = {
            ...key,
            ...item,
            lastUpdated: new Date().toISOString(),
        };

        await dynamoDb.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: itemToSave,
            })
        );
    } catch (error) {
        console.error("Error saving item to DynamoDB:", error);
        throw error;
    }
}

/**
 * Parse arrest date from various formats and return M/d/yyyy format
 */
function parseArrestDate(arrestDate?: string): string {
    const now = new Date();

    if (!arrestDate) {
        // Use current date if no arrest date
        return now.toISOString().split("T")[0]; // YYYY-MM-DD
    }

    try {
        // Handle format: M/d/yyyy h:mm:ss [AP]M
        const dateMatch = arrestDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
            const month = dateMatch[1].padStart(2, "0");
            const day = dateMatch[2].padStart(2, "0");
            const year = dateMatch[3];
            return `${year}-${month}-${day}`;
        }

        // Try to parse as ISO date
        const parsedDate = new Date(arrestDate);
        if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString().split("T")[0]; // YYYY-MM-DD
        }
    } catch (error) {
        console.warn(`Could not parse arrest date: ${arrestDate}`, error);
    }

    // Fallback to current date
    return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

const StorageClient = {
    /**
     * Save or update an inmate record
     */
    async saveInmate(facilityId: string, inmate: InmateRecord): Promise<void> {
        try {
            // Extract key information
            const firstName = inmate.FirstName || "";
            const lastName = inmate.LastName || "";
            const middleName = inmate.MiddleName || "";
            const totalBondAmount =
                typeof inmate.TotalBondAmount === "string"
                    ? parseFloat(inmate.TotalBondAmount) || 0
                    : inmate.TotalBondAmount || 0;

            // Parse arrest date to get the record date
            const recordDate = parseArrestDate(inmate.ArrestDate);
            const lastUpdated = new Date().toISOString();

            // Generate deterministic PK based on identity
            const inmateKey = Key.Inmate(
                facilityId,
                lastName,
                firstName,
                middleName,
                recordDate
            );
            const facilityGSI = getFacilityGSIKeys(facilityId, recordDate);

            const dynamoRecord: InmateDynamoRecord = {
                ...inmateKey,
                ...facilityGSI,
                totalBondAmount,
                recordDate,
                lastUpdated,
                rawData: inmate,
            };

            await save(
                { PK: dynamoRecord.PK, SK: dynamoRecord.SK },
                dynamoRecord
            );
        } catch (error) {
            console.error("Error saving inmate record:", error);
            throw error;
        }
    },

    /**
     * Get inmate records by facility (defaults to recent records - within 24 hours)
     */
    async getInmatesByFacility(
        facilityId: string,
        limit = 100
    ): Promise<InmateDynamoRecord[]> {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const cutoffDate = oneDayAgo.toISOString().split("T")[0]; // YYYY-MM-DD

        return this.getInmatesByFacilityAndDateRange(
            facilityId,
            cutoffDate,
            undefined,
            limit
        );
    },

    /**
     * Get inmate records by facility and date range
     */
    async getInmatesByFacilityAndDateRange(
        facilityId: string,
        startDate?: string, // YYYY-MM-DD format
        endDate?: string, // YYYY-MM-DD format
        limit = 100
    ): Promise<InmateDynamoRecord[]> {
        try {
            let keyConditionExpression = "GSI1PK = :gsi1pk";
            const expressionAttributeValues: Record<string, string> = {
                ":gsi1pk": `FACILITY#${facilityId}`,
            };

            // Add date range filtering if provided
            if (startDate && endDate) {
                keyConditionExpression +=
                    " AND GSI1SK BETWEEN :startDate AND :endDate";
                expressionAttributeValues[":startDate"] = startDate;
                expressionAttributeValues[":endDate"] = endDate;
            } else if (startDate) {
                keyConditionExpression += " AND GSI1SK >= :startDate";
                expressionAttributeValues[":startDate"] = startDate;
            } else if (endDate) {
                keyConditionExpression += " AND GSI1SK <= :endDate";
                expressionAttributeValues[":endDate"] = endDate;
            }

            const result = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: "GSI1",
                    KeyConditionExpression: keyConditionExpression,
                    ExpressionAttributeValues: expressionAttributeValues,
                    ScanIndexForward: false, // Most recent first
                    Limit: limit,
                })
            );

            return (result.Items || []).map((item) =>
                removeDynamoAttributes(item)) as InmateDynamoRecord[];
        } catch (error) {
            console.error(
                "Error getting inmates by facility and date range:",
                error
            );
            throw error;
        }
    },

    /**
     * Get all active inmates across all facilities
     */
    async getAllRecentInmates(limit = 100): Promise<InmateDynamoRecord[]> {
        try {
            // Get recent inmates from the last 24 hours across all facilities
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            const cutoffDate = oneDayAgo.toISOString().split("T")[0]; // YYYY-MM-DD

            const result = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: "GSI1",
                    KeyConditionExpression:
                        "begins_with(GSI1PK, :facilityPrefix) AND GSI1SK >= :cutoffDate",
                    ExpressionAttributeValues: {
                        ":facilityPrefix": "FACILITY#",
                        ":cutoffDate": cutoffDate,
                    },
                    ScanIndexForward: false, // Most recent first
                    Limit: limit,
                })
            );

            return (result.Items || []).map((item) =>
                removeDynamoAttributes(item)) as InmateDynamoRecord[];
        } catch (error) {
            console.error("Error getting all recent inmates:", error);
            throw error;
        }
    },

    /**
     * Search inmates by last name within a facility
     */
    async searchInmatesByLastName(
        facilityId: string,
        lastName: string,
        limit = 50
    ): Promise<InmateDynamoRecord[]> {
        try {
            // Use begins_with on PK to find inmates with matching last name
            const result = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "begins_with(PK, :pkPrefix)",
                    ExpressionAttributeValues: {
                        ":pkPrefix": `INMATE#${facilityId}#${lastName.toUpperCase()}`,
                    },
                    ScanIndexForward: true, // Alphabetical order
                    Limit: limit,
                })
            );

            return (result.Items || []).map((item) =>
                removeDynamoAttributes(item)) as InmateDynamoRecord[];
        } catch (error) {
            console.error("Error searching inmates by last name:", error);
            throw error;
        }
    },

    /**
     * Get a specific inmate record by identity
     */
    async getInmate(
        facilityId: string,
        lastName: string,
        firstName: string,
        middleName: string,
        recordDate: string
    ): Promise<InmateDynamoRecord | null> {
        const key = Key.Inmate(
            facilityId,
            lastName,
            firstName,
            middleName,
            recordDate
        );
        return await get<InmateDynamoRecord>(key);
    },

    /**
     * Batch save multiple inmate records (for performance)
     */
    async batchSaveInmates(
        facilityId: string,
        inmates: InmateRecord[]
    ): Promise<void> {
        try {
            // Process inmates in chunks of 25 (DynamoDB BatchWrite limit)
            const chunkSize = 25;

            for (let i = 0; i < inmates.length; i += chunkSize) {
                const chunk = inmates.slice(i, i + chunkSize);

                const putRequests = chunk.map((inmate) => {
                    const firstName = inmate.FirstName || "";
                    const lastName = inmate.LastName || "";
                    const middleName = inmate.MiddleName || "";
                    const totalBondAmount =
                        typeof inmate.TotalBondAmount === "string"
                            ? parseFloat(inmate.TotalBondAmount) || 0
                            : inmate.TotalBondAmount || 0;

                    const recordDate = parseArrestDate(inmate.ArrestDate);
                    const lastUpdated = new Date().toISOString();

                    const inmateKey = Key.Inmate(
                        facilityId,
                        lastName,
                        firstName,
                        middleName,
                        recordDate
                    );
                    const facilityGSI = getFacilityGSIKeys(
                        facilityId,
                        recordDate
                    );

                    const dynamoRecord: InmateDynamoRecord = {
                        ...inmateKey,
                        ...facilityGSI,
                        totalBondAmount,
                        recordDate,
                        lastUpdated,
                        rawData: inmate,
                    };

                    return {
                        PutRequest: {
                            Item: dynamoRecord,
                        },
                    };
                });

                await dynamoDb.send(
                    new BatchWriteCommand({
                        RequestItems: {
                            [TABLE_NAME]: putRequests,
                        },
                    })
                );
            }
        } catch (error) {
            console.error("Error batch saving inmate records:", error);
            throw error;
        }
    },
};

export default StorageClient;
