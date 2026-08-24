// tsup.config.ts
import { defineConfig } from "tsup";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false,
  clean: true,
  target: "es2022",

  // This is a Node.js library — mark all Node built-ins as external so
  // esbuild never tries to bundle them, and suppress the import.meta warning
  // by telling esbuild the platform is node (it then knows import.meta is
  // valid in ESM output and __filename is valid in CJS output).
  platform: "node",

  // Silence the "import.meta is not available with cjs" warning.
  // The typeof __filename guard in engine.ts means the import.meta.url
  // branch never runs in CJS — it is dead code in that format — but esbuild
  // still warns about it statically. esbuildOptions lets us pass the
  // logOverride to downgrade it from warning to silent.
  esbuildOptions(options) {
    options.logOverride = {
      ...options.logOverride,
      "empty-import-meta": "silent",
    };
  },

  async onSuccess() {
    const src = join("src", "engine.wasm");
    const dest = join("dist", "engine.wasm");
    try {
      await mkdir("dist", { recursive: true });
      await copyFile(src, dest);
      console.log("✔  engine.wasm → dist/engine.wasm");
    } catch (err) {
      console.warn(
        `⚠  engine.wasm not copied: ${err instanceof Error ? err.message : err}`,
      );
    }
  },
});
