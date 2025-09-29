module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/lib", "<rootDir>/api"],
    testMatch: ["**/__tests__/**/*.test.ts"],
    transform: {
        "^.+\\.ts$": "ts-jest",
    },
    collectCoverageFrom: [
        "lib/**/*.ts",
        "api/**/*.ts",
        "!**/*.d.ts",
        "!**/node_modules/**",
    ],
    coverageReporters: ["text", "lcov", "html"],
    moduleFileExtensions: ["ts", "js", "json"],
};
