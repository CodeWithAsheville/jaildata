import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import StorageClient from "../../lib/StorageClient";
import AlertService, { AlertCategory } from "../../lib/AlertService";
import { FacilityMapper } from "../../lib/FacilityMapping";

const alertService = AlertService.forCategory(AlertCategory.DATABASE);

export const getInmatesByFacility = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
        const facilityId = event.pathParameters?.facilityId;
        const limit = event.queryStringParameters?.limit
            ? parseInt(event.queryStringParameters.limit)
            : 100;

        if (!facilityId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing facilityId parameter" }),
            };
        }

        // Validate facility exists in our mapping
        if (!FacilityMapper.isValidFacilityName(facilityId)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: `Invalid facilityId: ${facilityId}. Valid facilities: ${FacilityMapper.getAllFacilities()
                        .map((f) => f.name)
                        .join(", ")}`,
                }),
            };
        }

        const inmates = await StorageClient.getInmatesByFacility(
            facilityId,
            limit
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                facilityId,
                inmates,
                count: inmates.length,
                description: "Recent inmates (last 24 hours)",
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (error) {
        await alertService.error(
            "Error getting inmates by facility",
            error as Error
        );
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};

export const getAllActiveInmates = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
        const limit = event.queryStringParameters?.limit
            ? parseInt(event.queryStringParameters.limit)
            : 100;

        const inmates = await StorageClient.getAllRecentInmates(limit);

        return {
            statusCode: 200,
            body: JSON.stringify({
                inmates,
                count: inmates.length,
                description: "Recent inmates (last 24 hours)",
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (error) {
        await alertService.error(
            "Error getting all active inmates",
            error as Error
        );
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};

export const searchInmatesByName = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
        const facilityId = event.pathParameters?.facilityId;
        const lastName = event.queryStringParameters?.lastName;
        const limit = event.queryStringParameters?.limit
            ? parseInt(event.queryStringParameters.limit)
            : 50;

        if (!facilityId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing facilityId parameter" }),
            };
        }

        // Validate facility exists in our mapping
        if (!FacilityMapper.isValidFacilityName(facilityId)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: `Invalid facilityId: ${facilityId}. Valid facilities: ${FacilityMapper.getAllFacilities()
                        .map((f) => f.name)
                        .join(", ")}`,
                }),
            };
        }

        if (!lastName) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: "Missing lastName query parameter",
                }),
            };
        }

        const inmates = await StorageClient.searchInmatesByLastName(
            facilityId,
            lastName,
            limit
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                facilityId,
                searchTerm: lastName,
                inmates,
                count: inmates.length,
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (error) {
        await alertService.error(
            "Error searching inmates by name",
            error as Error
        );
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};

export const getSpecificInmate = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
        const facilityId = event.pathParameters?.facilityId;
        const lastName = event.pathParameters?.lastName;
        const firstName = event.pathParameters?.firstName;
        const middleName = event.pathParameters?.middleName || "";
        const recordDate = event.pathParameters?.recordDate;

        if (!facilityId || !lastName || !firstName || !recordDate) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: "Missing required parameters: facilityId, lastName, firstName, recordDate",
                }),
            };
        }

        // Validate facility exists in our mapping
        if (!FacilityMapper.isValidFacilityName(facilityId)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: `Invalid facilityId: ${facilityId}. Valid facilities: ${FacilityMapper.getAllFacilities()
                        .map((f) => f.name)
                        .join(", ")}`,
                }),
            };
        }

        const inmate = await StorageClient.getInmate(
            facilityId,
            lastName,
            firstName,
            middleName,
            recordDate
        );

        if (!inmate) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Inmate not found" }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(inmate),
        };
    } catch (error) {
        await alertService.error(
            "Error getting specific inmate",
            error as Error
        );
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};
