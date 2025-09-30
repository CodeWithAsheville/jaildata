import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
    ScheduledEvent,
} from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import axios, { AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";
import AlertService, { AlertCategory } from "../../lib/AlertService";
import { FacilityMapper } from "../../lib/FacilityMapping";
import {
    DataCollectionConfig,
    InmateApiRequestBody,
    InmateApiResponse,
    BatchProcessingMessage,
} from "../../lib/types";

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const alertService = AlertService.forCategory(AlertCategory.DATA_COLLECTION);

// Cookie jar to store session cookies including XSRF token
class CookieJar {
    private cookies: Map<string, string> = new Map();

    public setCookie(cookieString: string): void {
        const cookies = cookieString.split(";");
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split("=");
            if (name && value) {
                this.cookies.set(name, value);
            }
        }
    }

    public getCookie(name: string): string | undefined {
        return this.cookies.get(name);
    }

    public getCookieHeader(): string {
        return Array.from(this.cookies.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join("; ");
    }

    public getXsrfToken(): string | undefined {
        return this.getCookie("XSRF-TOKEN");
    }
}

export class DataCollectionService {
    private axiosInstance: AxiosInstance;
    private cookieJar: CookieJar;
    private config: DataCollectionConfig;
    private facilityApiId: number;
    private facilityName: string;

    constructor(
        facilityName: string,
        baseUrl: string,
        batchSize: number = 100
    ) {
        this.facilityName = facilityName;
        this.config = {
            facilityId: facilityName, // Keep human-friendly name for internal use
            baseUrl: baseUrl,
            batchSize: batchSize,
        };
        this.cookieJar = new CookieJar();
        // Note: facilityApiId will be set during initialization
        this.facilityApiId = 0;

        // Create axios instance with interceptors for cookie handling
        this.axiosInstance = axios.create({
            baseURL: this.config.baseUrl,
            timeout: 30000,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; JailData/1.0)",
                Accept: "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });

        this.setupInterceptors();
    }

    // Initialize facility configuration (must be called after FacilityMapper.loadApiIds())
    public initializeFacility(): void {
        // Get facility configuration from mapping
        const facilityConfig = FacilityMapper.getFacilityByName(
            this.facilityName
        );
        if (!facilityConfig) {
            throw new Error(`Unknown facility: ${this.facilityName}`);
        }

        if (facilityConfig.apiId === 0) {
            throw new Error(
                `Facility ${this.facilityName} does not have a configured API ID`
            );
        }

        this.facilityApiId = facilityConfig.apiId;
    }

    private setupInterceptors(): void {
        // Intercept responses to capture cookies
        this.axiosInstance.interceptors.response.use(
            (response) => {
                const setCookieHeader = response.headers["set-cookie"];
                if (setCookieHeader) {
                    setCookieHeader.forEach((cookie: string) =>
                        this.cookieJar.setCookie(cookie));
                }
                return response;
            },
            (error) => {
                const setCookieHeader = error.response?.headers["set-cookie"];
                if (setCookieHeader) {
                    setCookieHeader.forEach((cookie: string) =>
                        this.cookieJar.setCookie(cookie));
                }
                throw error;
            }
        );

        // Intercept requests to add cookies and XSRF token
        this.axiosInstance.interceptors.request.use((config) => {
            // Add cookies to request
            const cookieHeader = this.cookieJar.getCookieHeader();
            if (cookieHeader) {
                config.headers["Cookie"] = cookieHeader;
            }

            // Add XSRF token for POST requests
            if (config.method?.toUpperCase() === "POST") {
                const xsrfToken = this.cookieJar.getXsrfToken();
                if (xsrfToken) {
                    config.headers["X-Xsrf-Token"] = xsrfToken;
                }
                config.headers["Origin"] = this.config.baseUrl;
                config.headers[
                    "Referer"
                ] = `${this.config.baseUrl}/Inmates/Catalog`;
            }

            return config;
        });
    }

    // Initialize session by making GET request to capture cookies
    public async initializeSession(): Promise<void> {
        try {
            await this.axiosInstance.get(`/api/inmates/${this.facilityApiId}`);

            const xsrfToken = this.cookieJar.getXsrfToken();
            if (!xsrfToken) {
                throw new Error(
                    "Failed to obtain XSRF token from initial request"
                );
            }

            await alertService.info(
                `Session initialized for facility ${this.config.facilityId}, XSRF token obtained`
            );
        } catch (error) {
            await alertService.error(
                `Failed to initialize session for facility ${this.config.facilityId}: ${error}`,
                error as Error
            );
            throw error;
        }
    }

    // Collect all inmate data with pagination
    public async collectAllInmates(): Promise<void> {
        const requestId = uuidv4();
        let skip = 0;
        let totalProcessed = 0;
        let batchNumber = 1;
        let totalRecords: number | null = null;

        try {
            await this.initializeSession();

            while (true) {
                const requestBody: InmateApiRequestBody = {
                    FilterOptionsParameters: {
                        IntersectionSearch: true,
                        SearchText: "",
                        Parameters: [],
                    },
                    IncludeCount: true,
                    PagingOptions: {
                        SortOptions: [
                            {
                                Name: "ArrestDate",
                                SortDirection: "Descending",
                                Sequence: 1,
                            },
                        ],
                        Take: this.config.batchSize,
                        Skip: skip,
                    },
                };

                const response =
                    await this.axiosInstance.post<InmateApiResponse>(
                        `/api/inmates/${this.facilityApiId}`,
                        requestBody
                    );

                const batch = response.data;

                // Set total on first batch
                if (totalRecords === null) {
                    totalRecords = batch.Total;
                    await alertService.info(
                        `Starting data collection for facility ${this.config.facilityId}: ${totalRecords} total records`
                    );
                }

                // Send batch to processing queue
                await this.sendBatchToQueue({
                    facilityId: this.config.facilityId,
                    batch,
                    batchNumber,
                    totalBatches: Math.ceil(
                        (totalRecords || 0) / this.config.batchSize
                    ),
                    requestId,
                });

                totalProcessed += batch.Inmates.length;

                // Check if we've processed all records
                if (
                    batch.Inmates.length < this.config.batchSize ||
                    totalProcessed >= (totalRecords || 0)
                ) {
                    break;
                }

                skip += this.config.batchSize;
                batchNumber++;
            }

            await alertService.info(
                `Data collection completed for facility ${this.config.facilityId}: ${totalProcessed} records in ${batchNumber} batches`
            );
        } catch (error) {
            await alertService.error(
                `Data collection failed for facility ${this.config.facilityId}: ${error}`,
                error as Error
            );
            throw error;
        }
    }

    private async sendBatchToQueue(
        message: BatchProcessingMessage
    ): Promise<void> {
        const queueUrl = `https://sqs.${process.env.AWS_REGION}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/jaildata-batch-processing-${process.env.STAGE}`;

        const command = new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message),
            MessageAttributes: {
                facilityId: {
                    DataType: "String",
                    StringValue: message.facilityId,
                },
                requestId: {
                    DataType: "String",
                    StringValue: message.requestId,
                },
                batchNumber: {
                    DataType: "Number",
                    StringValue: message.batchNumber.toString(),
                },
            },
        });

        await sqsClient.send(command);
    }
}

// Lambda handler for manual trigger (API Gateway)
export const collect = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
        // Load facility API IDs from Parameter Store
        await FacilityMapper.loadApiIds();

        const body = event.body ? JSON.parse(event.body) : {};
        const facilityId = body.facilityId || event.pathParameters?.facilityId;

        if (!facilityId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "facilityId is required" }),
            };
        }

        // Get base URL from SSM
        const baseUrlParam = await ssmClient.send(
            new GetParameterCommand({
                Name: "/jaildata/base-url",
                WithDecryption: true,
            })
        );

        if (!baseUrlParam.Parameter?.Value) {
            throw new Error("Base URL not configured in SSM Parameter Store");
        }

        const service = new DataCollectionService(
            facilityId,
            baseUrlParam.Parameter.Value,
            100
        );

        // Initialize facility configuration
        service.initializeFacility();

        // Start collection (runs asynchronously)
        service.collectAllInmates().catch((error) => {
            alertService.error(
                `Async data collection failed: ${error}`,
                error as Error
            );
        });

        return {
            statusCode: 202,
            body: JSON.stringify({
                message: "Data collection started",
                facilityId,
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (error) {
        await alertService.error(
            `Manual data collection failed: ${error}`,
            error as Error
        );

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to start data collection",
                message: (error as Error).message || "Unknown error",
            }),
        };
    }
};

// Lambda handler for scheduled trigger (EventBridge/CloudWatch Events)
export const collectScheduled = async (
    event: ScheduledEvent
): Promise<void> => {
    try {
        // Load facility API IDs from Parameter Store
        await FacilityMapper.loadApiIds();

        // Get facilityId from event input
        const eventInput = event.detail || {};
        const facilityId = eventInput.facilityId;

        if (!facilityId) {
            throw new Error("facilityId is required in event input");
        }

        // Get base URL from SSM
        const baseUrlParam = await ssmClient.send(
            new GetParameterCommand({
                Name: "/jaildata/base-url",
                WithDecryption: true,
            })
        );

        if (!baseUrlParam.Parameter?.Value) {
            throw new Error("Base URL not configured in SSM Parameter Store");
        }

        const service = new DataCollectionService(
            facilityId,
            baseUrlParam.Parameter.Value,
            100
        );

        // Initialize facility configuration
        service.initializeFacility();

        await service.collectAllInmates();

        await alertService.info(
            `Scheduled data collection completed successfully for facility ${facilityId}`
        );
    } catch (error) {
        await alertService.error(
            `Scheduled data collection failed: ${error}`,
            error as Error
        );
        throw error;
    }
};
