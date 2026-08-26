// src/node/engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Node runtime: loads engine.wasm from disk, next to the compiled JS.
//
// This is the implementation `../index.ts` (the Node entry point) wires up.
// The edge/browser entry point uses `../edge/engine.ts` instead, which has no
// disk to read from and instead decodes a copy of the engine embedded in the
// bundle at build time. Both delegate the actual Wasm call to the same
// `invokeEngine` in `../shared/engine-core.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { RenderError } from "../error.js";
import { invokeEngine } from "../shared/engine-core.js";
import type { Context, MergeTags, Target, Template } from "../types.js";

// ── Wasm instance (singleton, lazy-loaded) ────────────────────────────────────

let _instance: WebAssembly.Instance | null = null;

/**
 * Resets the cached Wasm instance. Only used in tests.
 * @internal
 */
export function __resetInstance(): void {
  _instance = null;
}

async function getInstance(): Promise<WebAssembly.Instance> {
  if (_instance) return _instance;

  // Resolve the directory that contains the *compiled* JS file at runtime.
  //
  // tsup outputs both ESM (index.mjs) and CJS (index.js) into dist/.
  // engine.wasm is copied into dist/ alongside them by tsup.config.ts.
  //
  //   ESM  → import.meta.url is defined, e.g. file:///…/dist/index.mjs
  //   CJS  → import.meta.url is undefined; use __filename instead
  //
  // We detect the format at runtime to get the correct directory in both cases.
  const dir =
    typeof __filename !== "undefined"
      ? // CJS runtime — __filename / __dirname are injected by Node
        join(__filename, "..")
      : // ESM runtime — use import.meta.url
        join(fileURLToPath(import.meta.url), "..");

  // Bundling flattens everything into dist/, so in the published package
  // engine.wasm is a direct sibling of the compiled file — candidate 1.
  // Running this file directly as source (tests, ts-node) instead executes
  // it from src/node/, one level below src/engine.wasm — candidate 2. Try
  // both rather than assuming one; whichever this file actually ships next
  // to at runtime is the one that resolves.
  const candidates = [join(dir, "engine.wasm"), join(dir, "..", "engine.wasm")];

  let bytes: Buffer | undefined;
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      bytes = await readFile(candidate);
      break;
    } catch (cause) {
      lastError = cause;
    }
  }

  if (!bytes) {
    throw new RenderError(
      "RENDER_ERROR",
      `Could not load engine.wasm. Looked in: ${candidates.join(", ")}. ` +
        `Make sure engine.wasm ships alongside the compiled JS. ` +
        `Original error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  // @ts-expect-error — WebAssembly.instantiate overload resolution incorrect for Buffer input
  const { instance } = await WebAssembly.instantiate(bytes, {});
  _instance = instance;
  return _instance as WebAssembly.Instance;
}

/**
 * Runs the engine and returns the raw, un-minified output.
 *
 * @throws {RenderError} `RENDER_ERROR` if the engine reports a failure, or if
 *   engine.wasm cannot be found or loaded.
 */
export async function runEngine(
  template: Template,
  target: Target,
  mergeTags: MergeTags | undefined,
  context: Context | undefined,
): Promise<string> {
  const instance = await getInstance();
  return invokeEngine(instance, template, target, mergeTags, context);
}
