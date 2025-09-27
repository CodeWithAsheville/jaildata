import AlertService, { Severity, AlertCategory } from "../AlertService";

// Mock AWS SDK clients
jest.mock("@aws-sdk/client-cloudwatch", () => ({
    CloudWatchClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({}),
    })),
    PutMetricDataCommand: jest.fn(),
}));

jest.mock("@aws-sdk/client-sns", () => ({
    SNSClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({}),
    })),
    PublishCommand: jest.fn(),
}));

jest.mock("@aws-sdk/client-ssm", () => ({
    SSMClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({
            Parameter: {
                Value: "arn:aws:sns:us-east-2:123456789012:jaildata-alerts-dev",
            },
        }),
    })),
    GetParameterCommand: jest.fn(),
}));

jest.mock("@aws-sdk/client-dynamodb", () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({
            Item: {
                errorCount: { N: "1" },
                firstSeen: { N: Date.now().toString() },
                lastSeen: { N: Date.now().toString() },
                lastReported: { N: "0" },
            },
        }),
    })),
    PutItemCommand: jest.fn(),
    GetItemCommand: jest.fn(),
    UpdateItemCommand: jest.fn(),
}));

describe("AlertService", () => {
    // Spy on console methods
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    beforeEach(() => {
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();

        // Set test environment variables
        process.env.STAGE = "test";
        process.env.ERROR_CACHE_TABLE = "jaildata-error-cache-test";
    });

    afterEach(() => {
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;

        // Clean up environment variables
        delete process.env.STAGE;
        delete process.env.ERROR_CACHE_TABLE;
    });

    describe("logError", () => {
        it("should log errors with the correct severity", async () => {
            await AlertService.logError(
                Severity.INFO,
                AlertCategory.SYSTEM,
                "Info message"
            );

            await AlertService.logError(
                Severity.WARNING,
                AlertCategory.NETWORK,
                "Warning message",
                new Error("Network warning")
            );

            await AlertService.logError(
                Severity.ERROR,
                AlertCategory.PORTAL,
                "Error message",
                new Error("Portal error")
            );

            expect(console.log).toHaveBeenCalledWith(
                "[SYS] Info message",
                undefined
            );

            expect(console.warn).toHaveBeenCalledWith(
                "[NET] Warning message",
                "Network warning",
                undefined
            );

            expect(console.error).toHaveBeenCalledWith(
                "[PORTAL] Error message",
                "Portal error",
                expect.stringContaining("Error: Portal error"),
                undefined
            );
        });

        it("should handle critical errors", async () => {
            await AlertService.logError(
                Severity.CRITICAL,
                AlertCategory.DATABASE,
                "Database connection failed",
                new Error("Connection timeout"),
                { connectionId: "conn-123", timeout: 5000 }
            );

            expect(console.error).toHaveBeenCalledWith(
                "[DB] Database connection failed",
                "Connection timeout",
                expect.stringContaining("Error: Connection timeout"),
                { connectionId: "conn-123", timeout: 5000 }
            );
        });
    });

    describe("forCategory", () => {
        it("should create a scoped logger for a specific category", async () => {
            const authLogger = AlertService.forCategory(
                AlertCategory.AUTHENTICATION
            );

            expect(typeof authLogger.info).toBe("function");
            expect(typeof authLogger.warn).toBe("function");
            expect(typeof authLogger.error).toBe("function");
            expect(typeof authLogger.critical).toBe("function");

            await authLogger.error(
                "Authentication failed",
                new Error("Bad credentials"),
                { userId: "test-user" }
            );

            expect(console.error).toHaveBeenCalledWith(
                "[AUTH] Authentication failed",
                "Bad credentials",
                expect.stringContaining("Error: Bad credentials"),
                { userId: "test-user" }
            );
        });

        it("should handle different severity levels correctly", async () => {
            const systemLogger = AlertService.forCategory(AlertCategory.SYSTEM);

            await systemLogger.info("System startup", { version: "1.0.0" });
            await systemLogger.warn(
                "High memory usage",
                new Error("Memory threshold exceeded")
            );
            await systemLogger.error(
                "Service unavailable",
                new Error("Service timeout")
            );
            await systemLogger.critical(
                "System failure",
                new Error("Critical system error")
            );

            expect(console.log).toHaveBeenCalledWith("[SYS] System startup", {
                version: "1.0.0",
            });
            expect(console.warn).toHaveBeenCalledWith(
                "[SYS] High memory usage",
                "Memory threshold exceeded",
                undefined
            );
            expect(console.error).toHaveBeenCalledWith(
                "[SYS] Service unavailable",
                "Service timeout",
                expect.stringContaining("Error: Service timeout"),
                undefined
            );
            expect(console.error).toHaveBeenCalledWith(
                "[SYS] System failure",
                "Critical system error",
                expect.stringContaining("Error: Critical system error"),
                undefined
            );
        });
    });

    describe("AlertCategory enum", () => {
        it("should have all expected categories", () => {
            expect(AlertCategory.AUTHENTICATION).toBe("AUTH");
            expect(AlertCategory.DATABASE).toBe("DB");
            expect(AlertCategory.NETWORK).toBe("NET");
            expect(AlertCategory.PORTAL).toBe("PORTAL");
            expect(AlertCategory.QUEUE).toBe("QUEUE");
            expect(AlertCategory.SYSTEM).toBe("SYS");
        });
    });

    describe("Severity enum", () => {
        it("should have all expected severity levels", () => {
            expect(Severity.INFO).toBe("INFO");
            expect(Severity.WARNING).toBe("WARNING");
            expect(Severity.ERROR).toBe("ERROR");
            expect(Severity.CRITICAL).toBe("CRITICAL");
        });
    });
});
