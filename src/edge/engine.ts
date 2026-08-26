// src/edge/engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Edge/browser runtime: no disk, so engine.wasm can't be read as a file next
// to the compiled JS the way ../node/engine.ts does it.
//
// Instead, the build (see tsup.config.ts) inlines engine.wasm into this file
// as a base64 string — esbuild's `base64` loader does the encoding, so there
// is no separate generated-file step to keep in sync. That trades ~33% extra
// bytes (a 260 KB engine becomes a ~350 KB string) for something that needs
// zero bundler configuration and makes zero network calls: it works the same
// way in a plain <script type="module">, in a Cloudflare Worker, in Vercel's
// Edge Runtime, or in any other environment that merely has `WebAssembly` and
// `atob` — which is to say, all of them. Consumers who'd rather not pay the
// size cost and can supply a compiled instance another way (for example
// Wrangler's native Wasm module import) can use `renderWithInstance` from
// `@maildeno/renderer/core` instead, which skips this file entirely.
//
// Both this and ../node/engine.ts delegate the actual Wasm call to the same
// `invokeEngine` in ../shared/engine-core.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { RenderError } from "../error.js";
import { invokeEngine } from "../shared/engine-core.js";
// esbuild's `base64` loader (configured in tsup.config.ts for this entry)
// turns this into `export default "<base64 of engine.wasm>"` at build time.
// See ./wasm-module.d.ts for the ambient module declaration that makes this
// a valid import as far as TypeScript is concerned.
import wasmBase64 from "../engine.wasm";
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

/**
 * Decodes a base64 string to bytes using only standard Web APIs — no
 * `Buffer`, since it isn't guaranteed to exist in every runtime this build
 * targets (real browsers don't have it without a polyfill).
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getInstance(): Promise<WebAssembly.Instance> {
  if (_instance) return _instance;

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(wasmBase64);
  } catch (cause) {
    throw new RenderError(
      "RENDER_ERROR",
      `Could not decode the embedded engine.wasm. This build may not have ` +
        `been produced correctly — the base64 payload should be inlined by ` +
        `the package's own build step. Original error: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  try {
    // @ts-expect-error — WebAssembly.instantiate overload resolution incorrect for Uint8Array input
    const { instance } = await WebAssembly.instantiate(bytes, {});
    _instance = instance;
    return instance as WebAssembly.Instance;
  } catch (cause) {
    throw new RenderError(
      "RENDER_ERROR",
      `Could not instantiate engine.wasm in this runtime: ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/**
 * Runs the engine and returns the raw, un-minified output.
 *
 * @throws {RenderError} `RENDER_ERROR` if the engine reports a failure, or if
 *   the embedded engine.wasm cannot be decoded or instantiated.
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
