// src/edge/wasm-module.d.ts
// ─────────────────────────────────────────────────────────────────────────────
// Only ./engine.ts imports a `.wasm` file directly (as a value, not
// instantiated) — see tsup.config.ts, which configures esbuild's `base64`
// loader for that build so the import resolves to a base64-encoded string of
// the file's bytes at build time. This declaration is what makes that import
// type-check; it has no effect on the Node build, which never imports
// engine.wasm as a module (it reads the file at runtime instead).
// ─────────────────────────────────────────────────────────────────────────────

declare module "*.wasm" {
  const base64: string;
  export default base64;
}
