/**
 * Facility mapping between human-friendly names and numeric API IDs
 * API IDs are loaded from Parameter Store
 *
 * Parameter Store Convention:
 * - API IDs are stored at: /jaildata/facilities/{facility-name}/api-id
 * - Where {facility-name} corresponds to the 'name' field in the facility config
 * - Example: /jaildata/facilities/buncombe/api-id
 */

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

export interface FacilityConfig {
    /** Human-friendly name used in our APIs */
    name: string;
    /** Numeric facility ID used by the jail data API */
    apiId: number;
    /** Full county name for display purposes */
    displayName: string;
}

interface BaseFacilityConfig {
    /** Human-friendly name used in our APIs */
    name: string;
    /** Full county name for display purposes */
    displayName: string;
}

// Parameter Store path convention: /jaildata/facilities/{facility-name}/api-id
const FACILITY_API_ID_PARAMETER_PREFIX = "/jaildata/facilities";

// Base facility configuration without sensitive API IDs
const BASE_FACILITY_MAPPING: Record<string, BaseFacilityConfig> = {
    // wake: {
    //     name: 'wake',
    //     displayName: 'Wake County'
    // },
    buncombe: {
        name: "buncombe",
        displayName: "Buncombe County",
    },
};

// Static facility mapping (initialized with API ID 0, updated via loadApiIds)
export const FACILITY_MAPPING: Record<string, FacilityConfig> =
    Object.fromEntries(
        Object.entries(BASE_FACILITY_MAPPING).map(([key, baseConfig]) => [
            key,
            {
                name: baseConfig.name,
                displayName: baseConfig.displayName,
                apiId: 0, // Will be loaded from Parameter Store
            },
        ])
    );

// Reverse mapping for API ID to name lookups (will be populated after loading API IDs)
export const API_ID_TO_NAME: Record<number, string> = {};

// Singleton class to manage loading API IDs from Parameter Store
class FacilityApiLoader {
    private static instance: FacilityApiLoader;
    private ssmClient: SSMClient;
    private loaded = false;

    private constructor() {
        this.ssmClient = new SSMClient({ region: process.env.AWS_REGION });
    }

    static getInstance(): FacilityApiLoader {
        if (!FacilityApiLoader.instance) {
            FacilityApiLoader.instance = new FacilityApiLoader();
        }
        return FacilityApiLoader.instance;
    }

    /**
     * Load API IDs from Parameter Store and update the facility mapping
     * This should be called once during application initialization
     */
    async loadApiIds(): Promise<void> {
        if (this.loaded) {
            return;
        }

        console.log("Loading facility API IDs from Parameter Store...");

        for (const [facilityName, baseConfig] of Object.entries(
            BASE_FACILITY_MAPPING
        )) {
            try {
                // Use convention-based parameter name: /jaildata/facilities/{name}/api-id
                const parameterName = `${FACILITY_API_ID_PARAMETER_PREFIX}/${baseConfig.name}/api-id`;

                const command = new GetParameterCommand({
                    Name: parameterName,
                    WithDecryption: true,
                });

                const response = await this.ssmClient.send(command);
                const apiId = response.Parameter?.Value
                    ? parseInt(response.Parameter.Value, 10)
                    : 0;

                // Update the facility mapping
                FACILITY_MAPPING[facilityName].apiId = apiId;

                // Build reverse mapping for active facilities
                if (apiId > 0) {
                    API_ID_TO_NAME[apiId] = facilityName;
                }

                console.log(
                    `Loaded API ID for ${facilityName}: ${
                        apiId > 0 ? "[CONFIGURED]" : "[NOT CONFIGURED]"
                    }`
                );
            } catch (error) {
                console.warn(
                    `Failed to load API ID for facility ${facilityName}:`,
                    error
                );
                // Keep API ID as 0 if parameter not found
            }
        }

        this.loaded = true;
        console.log("Facility API IDs loaded successfully");
    }

    isLoaded(): boolean {
        return this.loaded;
    }
}

export class FacilityMapper {
    /**
     * Load API IDs from Parameter Store (call this during app initialization)
     */
    static async loadApiIds(): Promise<void> {
        const loader = FacilityApiLoader.getInstance();
        await loader.loadApiIds();
    }

    /**
     * Check if API IDs have been loaded from Parameter Store
     */
    static isApiIdsLoaded(): boolean {
        const loader = FacilityApiLoader.getInstance();
        return loader.isLoaded();
    }

    /**
     * Get facility config by human-friendly name
     */
    static getFacilityByName(name: string): FacilityConfig | null {
        return FACILITY_MAPPING[name.toLowerCase()] || null;
    }

    /**
     * Get facility config by numeric API ID
     */
    static getFacilityByApiId(apiId: number): FacilityConfig | null {
        const name = API_ID_TO_NAME[apiId];
        return name ? FACILITY_MAPPING[name] : null;
    }

    /**
     * Get the numeric API ID for a facility name
     */
    static getApiIdForFacility(name: string): number | null {
        const facility = this.getFacilityByName(name);
        return facility ? facility.apiId : null;
    }

    /**
     * Get human-friendly name for an API ID
     */
    static getNameForApiId(apiId: number): string | null {
        return API_ID_TO_NAME[apiId] || null;
    }

    /**
     * Validate that a facility name exists in our mapping
     */
    static isValidFacilityName(name: string): boolean {
        return name.toLowerCase() in FACILITY_MAPPING;
    }

    /**
     * Get all configured facilities
     */
    static getAllFacilities(): FacilityConfig[] {
        return Object.values(FACILITY_MAPPING);
    }

    /**
     * Get all facilities that have valid API IDs (> 0)
     */
    static getActiveFacilities(): FacilityConfig[] {
        return Object.values(FACILITY_MAPPING).filter((f) => f.apiId > 0);
    }
}
