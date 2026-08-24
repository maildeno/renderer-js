// vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 10_000,
    reporters: process.env.CI ? ["dot", "json"] : ["verbose"],
    outputFile: {
      json: "./coverage/test-results.json",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts", "**/*.test.ts", "**/*.spec.ts", "**/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
      thresholdAutoUpdate: false,
    },
  },
});
