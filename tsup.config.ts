// tsup.config.ts
import { defineConfig } from "tsup";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export default defineConfig([
  // ── Node build ────────────────────────────────────────────────────────────
  // dist/index.{js,mjs} — reads engine.wasm from disk at runtime (engine.node.ts),
  // reads template files from disk (load.node.ts). This is what the "node"
  // condition in package.json's `exports` points at.
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: false,
    clean: true,
    target: "es2022",

    // This is a Node.js build — mark all Node built-ins as external so
    // esbuild never tries to bundle them, and suppress the import.meta warning
    // by telling esbuild the platform is node (it then knows import.meta is
    // valid in ESM output and __filename is valid in CJS output).
    platform: "node",

    // Silence the "import.meta is not available with cjs" warning.
    // The typeof __filename guard in engine.node.ts means the import.meta.url
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
  },

  // ── Edge/browser build ───────────────────────────────────────────────────
  // dist/index.edge.{js,mjs} and dist/core.{js,mjs} — no `node:*` imports.
  // engine.wasm is inlined as a base64 string via esbuild's `base64` loader
  // (see engine.edge.ts and src/wasm-module.d.ts), so this has no disk and no
  // network dependency. This is what the "workerd" / "edge-light" / "browser"
  // conditions in package.json's `exports` point at.
  {
    entry: {
      "index.edge": "src/index.edge.ts",
      core: "src/core.ts",
    },
    format: ["cjs", "esm"],
    dts: false,
    // The Node build above already cleaned dist/ once; cleaning again here
    // would delete what it just wrote, since both configs share an outDir.
    clean: false,
    target: "es2022",

    // No Node built-ins assumed or externalised — this must run in browsers.
    platform: "browser",

    esbuildOptions(options) {
      // Inline engine.wasm as a base64 string at the one place it's imported
      // (engine.edge.ts). This is the mechanism that makes the edge build
      // self-contained: no separate asset to deploy, no fetch() at runtime.
      options.loader = {
        ...options.loader,
        ".wasm": "base64",
      };
    },
  },
]);
