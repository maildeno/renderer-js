// vitest.config.mts
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * Mirrors esbuild's `loader: 'base64'` for `.wasm` (configured in
 * tsup.config.ts for the edge/browser build) inside the test environment.
 *
 * src/edge/engine.ts does `import wasmBase64 from "../engine.wasm"` expecting
 * a plain base64 string — that's what the real build produces. Vite's own
 * default asset handling for an unrecognised binary file gives a URL string
 * instead, which would make tests exercise a different import shape than
 * production actually has. This plugin closes that gap so the test run is
 * evidence about the real thing, not a lookalike.
 */
function wasmAsBase64(): Plugin {
  return {
    name: "wasm-as-base64",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".wasm")) return null;
      const base64 = readFileSync(id).toString("base64");
      return `export default ${JSON.stringify(base64)};`;
    },
  };
}

export default defineConfig({
  plugins: [wasmAsBase64()],
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
      // Just re-exports / entry wiring — see src/ARCHITECTURE.md. Everything
      // these files delegate to (src/shared/, src/node/, src/edge/) is real
      // logic and stays covered.
      exclude: [
        "**/types.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.d.ts",
        "**/index.ts",
        "**/index.edge.ts",
      ],
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
