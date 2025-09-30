// Common types for jail data processing

// Response structure from jail API (used for both API responses and batch processing)
export interface InmateApiBatch {
    Inmates: InmateRecord[];
    Total: number;
    ShowImages: boolean;
}

// Loose typing for inmate record as requested - keeping it flexible
export interface InmateRecord {
    // We'll extract these as attributes for DynamoDB
    FirstName?: string;
    LastName?: string;
    MiddleName?: string;
    TotalBondAmount?: number | string;
    ArrestDate?: string; // Format: M/d/yyyy h:mm:ss [AP]M

    // Allow any other properties that come from the API
    [key: string]: unknown;
}

// DynamoDB record structure (single table design)
export interface InmateDynamoRecord extends Record<string, unknown> {
    PK: string; // INMATE#{facilityName}#{lastName}#{firstName}#{middleName}
    SK: string; // Record date in YYYY-MM-DD format (from ArrestDate, naturally sortable)
    GSI1PK?: string; // FACILITY#{facilityName} (for facility-based queries)
    GSI1SK?: string; // Record date in YYYY-MM-DD format (same as SK, for date-based sorting)
    totalBondAmount?: number;
    recordDate: string; // Record date in YYYY-MM-DD format (same as SK)
    lastUpdated: string; // ISO timestamp of last update
    rawData: InmateRecord; // Full original record
}

// SQS message types
export interface BatchProcessingMessage {
    facilityId: string;
    batch: InmateApiBatch;
    batchNumber: number;
    totalBatches?: number;
    requestId: string; // For tracking/correlation
}

// Data collection configuration
export interface DataCollectionConfig {
    baseUrl: string;
    facilityId: string;
    batchSize: number; // Default 100 from the API structure
}

// Pagination options for the API request
export interface PagingOptions {
    SortOptions: Array<{
        Name: string;
        SortDirection: "Ascending" | "Descending";
        Sequence: number;
    }>;
    Take: number;
    Skip: number;
}

// Filter options for the API request
export interface FilterOptionsParameters {
    IntersectionSearch: boolean;
    SearchText: string;
    Parameters: unknown[];
}

// Complete API request body structure
export interface InmateApiRequestBody {
    FilterOptionsParameters: FilterOptionsParameters;
    IncludeCount: boolean;
    PagingOptions: PagingOptions;
}

// Type aliases for backward compatibility and semantic clarity
export type InmateApiResponse = InmateApiBatch; // Alias for API responses

// Note: Severity and AlertCategory are exported from AlertService.ts
