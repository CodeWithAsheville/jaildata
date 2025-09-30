import {
    FacilityMapper,
    FACILITY_MAPPING,
    API_ID_TO_NAME,
} from "../FacilityMapping";

describe("FacilityMapping", () => {
    describe("FACILITY_MAPPING", () => {
        it("should have the correct structure for buncombe facility", () => {
            expect(FACILITY_MAPPING.buncombe).toEqual({
                name: "buncombe",
                apiId: 0, // Initially 0, loaded from Parameter Store
                displayName: "Buncombe County",
            });
        });

        it("should only contain buncombe facility (wake is commented out)", () => {
            expect(Object.keys(FACILITY_MAPPING)).toEqual(["buncombe"]);
        });
    });

    describe("API_ID_TO_NAME", () => {
        it("should be empty initially (populated after loadApiIds)", () => {
            expect(Object.keys(API_ID_TO_NAME)).toHaveLength(0);
        });

        it("should not include wake facility (commented out)", () => {
            expect(API_ID_TO_NAME[384]).toBeUndefined();
        });

        it("should not include facilities with API ID 0", () => {
            expect(API_ID_TO_NAME[0]).toBeUndefined();
        });
    });

    describe("FacilityMapper.getFacilityByName", () => {
        it("should return correct facility config for buncombe", () => {
            const buncombeConfig = FacilityMapper.getFacilityByName("buncombe");
            expect(buncombeConfig).toEqual({
                name: "buncombe",
                apiId: 0, // Initially 0, loaded from Parameter Store
                displayName: "Buncombe County",
            });
        });

        it("should be case insensitive", () => {
            const buncombeConfig = FacilityMapper.getFacilityByName("BUNCOMBE");
            expect(buncombeConfig).toEqual({
                name: "buncombe",
                apiId: 0, // Initially 0, loaded from Parameter Store
                displayName: "Buncombe County",
            });
        });

        it("should return null for wake (commented out)", () => {
            expect(FacilityMapper.getFacilityByName("wake")).toBeNull();
        });

        it("should return null for invalid facility names", () => {
            expect(FacilityMapper.getFacilityByName("invalid")).toBeNull();
            expect(FacilityMapper.getFacilityByName("")).toBeNull();
        });
    });

    describe("FacilityMapper.getFacilityByApiId", () => {
        it("should return null initially (no API IDs loaded)", () => {
            const buncombeConfig = FacilityMapper.getFacilityByApiId(23);
            expect(buncombeConfig).toBeNull();
        });

        it("should return null for wake API ID (commented out)", () => {
            expect(FacilityMapper.getFacilityByApiId(384)).toBeNull();
        });

        it("should return null for invalid API IDs", () => {
            expect(FacilityMapper.getFacilityByApiId(999)).toBeNull();
            expect(FacilityMapper.getFacilityByApiId(0)).toBeNull();
        });
    });

    describe("FacilityMapper.getApiIdForFacility", () => {
        it("should return 0 initially for buncombe (not loaded yet)", () => {
            expect(FacilityMapper.getApiIdForFacility("buncombe")).toBe(0);
        });

        it("should return null for wake (commented out)", () => {
            expect(FacilityMapper.getApiIdForFacility("wake")).toBeNull();
        });

        it("should return null for invalid facility names", () => {
            expect(FacilityMapper.getApiIdForFacility("invalid")).toBeNull();
        });
    });

    describe("FacilityMapper.getNameForApiId", () => {
        it("should return null initially (no API IDs loaded)", () => {
            expect(FacilityMapper.getNameForApiId(23)).toBeNull();
        });

        it("should return null for wake API ID (commented out)", () => {
            expect(FacilityMapper.getNameForApiId(384)).toBeNull();
        });

        it("should return null for invalid API IDs", () => {
            expect(FacilityMapper.getNameForApiId(999)).toBeNull();
            expect(FacilityMapper.getNameForApiId(0)).toBeNull();
        });
    });

    describe("FacilityMapper.isValidFacilityName", () => {
        it("should return true for buncombe", () => {
            expect(FacilityMapper.isValidFacilityName("buncombe")).toBe(true);
        });

        it("should be case insensitive", () => {
            expect(FacilityMapper.isValidFacilityName("BUNCOMBE")).toBe(true);
            expect(FacilityMapper.isValidFacilityName("Buncombe")).toBe(true);
        });

        it("should return false for wake (commented out)", () => {
            expect(FacilityMapper.isValidFacilityName("wake")).toBe(false);
        });

        it("should return false for invalid facility names", () => {
            expect(FacilityMapper.isValidFacilityName("invalid")).toBe(false);
            expect(FacilityMapper.isValidFacilityName("")).toBe(false);
        });
    });

    describe("FacilityMapper.getAllFacilities", () => {
        it("should return only buncombe facility", () => {
            const facilities = FacilityMapper.getAllFacilities();
            expect(facilities).toHaveLength(1);
            expect(facilities.map((f) => f.name)).toEqual(["buncombe"]);
        });

        it("should return facilities with correct structure", () => {
            const facilities = FacilityMapper.getAllFacilities();
            facilities.forEach((facility) => {
                expect(facility).toHaveProperty("name");
                expect(facility).toHaveProperty("apiId");
                expect(facility).toHaveProperty("displayName");
                expect(typeof facility.name).toBe("string");
                expect(typeof facility.apiId).toBe("number");
                expect(typeof facility.displayName).toBe("string");
            });
        });
    });

    describe("FacilityMapper.getActiveFacilities", () => {
        it("should return empty array initially (no API IDs loaded)", () => {
            const activeFacilities = FacilityMapper.getActiveFacilities();
            expect(activeFacilities).toHaveLength(0);
        });

        it("should not include facilities with API ID 0", () => {
            const activeFacilities = FacilityMapper.getActiveFacilities();
            const inactiveFacilities = activeFacilities.filter(
                (f) => f.apiId === 0
            );
            expect(inactiveFacilities).toHaveLength(0);
        });

        it("should return facilities that can be used for data collection", () => {
            const activeFacilities = FacilityMapper.getActiveFacilities();
            activeFacilities.forEach((facility) => {
                expect(facility.apiId).toBeGreaterThan(0);
            });
        });
    });
});
