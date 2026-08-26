// src/shared/engine-core.ts
//
// Portable Wasm calling convention — no Node or browser-specific APIs.
//
// This is the part of the old engine.ts that never actually touched `fs`: once
// something has handed over a live `WebAssembly.Instance`, running it is just
// `WebAssembly` + `TextEncoder`/`TextDecoder`, all available identically in
// Node, browsers, and every edge runtime. Getting *to* that instance — reading
// engine.wasm off disk vs. decoding an embedded copy — is the part that
// differs, and lives in `../node/engine.ts` / `../edge/engine.ts` instead.
//
// Memory contract with the Rust engine
// ─────────────────────────────────────
//   alloc(len: i32) → i32          allocate `len` bytes, return pointer
//   dealloc(ptr: i32, len: i32)    free a previously alloc'd region
//   dealloc_str(ptr: i32)          free a null-terminated result string
//   render(ptr: i32, len: i32) → i32
//       Read `len` bytes of UTF-8 JSON from linear memory at `ptr`,
//       process, write a null-terminated UTF-8 JSON string elsewhere
//       in linear memory, return its pointer.
//   heap_peak() → i32
//       Return the peak heap bytes used since the last render call start.
//       Used for profiling — safe to call after every render().
//
// Input JSON shape  (→ Rust):
//   {
//     "template":     TemplateJson,
//     "target":       "html" | "react-email" | "mjml",
//     "dynamic_data": { merge_tags?: {...}, context?: {...} }
//   }
//
// Output JSON shape (← Rust):
//   { "output": "...rendered string..." }   on success
//   { "error":  "...message..." }           on failure

import { RenderError } from "../error.js";
import type { Context, MergeTags, Target, Template } from "../types.js";

export interface WasmExports {
  memory: WebAssembly.Memory;
  alloc: (len: number) => number;
  dealloc: (ptr: number, len: number) => void;
  dealloc_str: (ptr: number) => void;
  render: (ptr: number, len: number) => number;
  heap_peak: () => number;
}

// ── String helpers ────────────────────────────────────────────────────────────

function writeString(
  memory: WebAssembly.Memory,
  ptr: number,
  str: string,
): void {
  const encoded = new TextEncoder().encode(str);
  new Uint8Array(memory.buffer).set(encoded, ptr);
}

function readCString(memory: WebAssembly.Memory, ptr: number): string {
  const buf = new Uint8Array(memory.buffer);
  let end = ptr;
  while (buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(ptr, end));
}

// ── Public invocation function ────────────────────────────────────────────────

/**
 * Runs an already-instantiated engine and returns the raw, un-minified output.
 *
 * Minification is the caller's decision (see render.ts) — the engine has no
 * opinion on it, and keeping it out of here means this stays a pure bridge.
 *
 * @throws {RenderError} `RENDER_ERROR` if the engine reports a failure.
 */
export async function invokeEngine(
  instance: WebAssembly.Instance,
  template: Template,
  target: Target,
  mergeTags: MergeTags | undefined,
  context: Context | undefined,
): Promise<string> {
  const exports = instance.exports as unknown as WasmExports;
  const memory = exports.memory;

  // The engine's envelope uses snake_case and nests both under `dynamic_data`.
  // That shape is fixed by the compiled Rust, so the translation from our
  // flatter public API happens here rather than leaking into it.
  const dynamic_data: Record<string, unknown> = {};
  if (mergeTags) dynamic_data.merge_tags = mergeTags;
  if (context) dynamic_data.context = context;

  const input = JSON.stringify({ template, target, dynamic_data });

  const encoded = new TextEncoder().encode(input);
  const inputLen = encoded.length;

  const inputPtr = exports.alloc(inputLen);
  writeString(memory, inputPtr, input);

  const resultPtr = exports.render(inputPtr, inputLen);
  exports.dealloc(inputPtr, inputLen);

  // Only log when approaching the heap ceiling (>75% of 12 MB), heap size for template rendering are normally less than 2 MB. Headroom over worst case - 5.5×
  const peakBytes = exports.heap_peak();
  if (peakBytes > 9 * 1024 * 1024) {
    // eslint-disable-next-line no-console
    console.warn(
      `[maildeno-engine] heap usage high: ${(peakBytes / 1024 / 1024).toFixed(2)} MB` +
        `  target=${target}`,
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  const resultJson = readCString(memory, resultPtr);
  exports.dealloc_str(resultPtr);

  let parsed: { output?: string; error?: string };
  try {
    parsed = JSON.parse(resultJson) as { output?: string; error?: string };
  } catch {
    throw new RenderError(
      "RENDER_ERROR",
      `Engine returned non-JSON: ${resultJson.slice(0, 120)}`,
    );
  }

  if (parsed.error) {
    throw new RenderError("RENDER_ERROR", parsed.error);
  }

  if (typeof parsed.output !== "string") {
    throw new RenderError(
      "RENDER_ERROR",
      "Engine response missing 'output' field.",
    );
  }

  return parsed.output;
}
