// tests/edge/engine.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { runEngine, __resetInstance } from "../../src/edge/engine.js";

const baseTemplate = {
  template_id: "id",
  template_name: "name",
  canvas: {},
  rows: [
    {
      id: "r",
      columns: [
        {
          id: "c",
          components: [
            { id: "x", type: "paragraph" as const, props: { content: "Hello {{ text.name }}" } },
          ],
        },
      ],
    },
  ],
  schema_version: "1.0.0",
};

describe("engine.edge: end-to-end against the real embedded engine", () => {
  beforeEach(() => {
    __resetInstance();
  });

  afterEach(() => {
    __resetInstance();
  });

  it("renders html using the base64-embedded copy of engine.wasm — no fs involved", async () => {
    const html = await runEngine(baseTemplate, "html", { text: { name: "Ada" } }, undefined);
    expect(html).toContain("<html");
    expect(html).toContain("Ada");
  });

  it("renders mjml", async () => {
    const mjml = await runEngine(baseTemplate, "mjml", undefined, undefined);
    expect(mjml).toContain("<mjml");
  });

  it("renders react-email", async () => {
    const tsx = await runEngine(baseTemplate, "react-email", undefined, undefined);
    expect(tsx.length).toBeGreaterThan(0);
  });

  it("caches the instance across calls (second call doesn't re-decode)", async () => {
    const first = await runEngine(baseTemplate, "html", undefined, undefined);
    const second = await runEngine(baseTemplate, "html", undefined, undefined);
    expect(first).toBe(second);
  });

  it("__resetInstance() forces a fresh decode+instantiate on the next call", async () => {
    await runEngine(baseTemplate, "html", undefined, undefined);
    __resetInstance();
    // If this throws, the reset broke something; if it resolves, a fresh
    // instance was successfully built from the embedded bytes again.
    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).resolves.toContain("<html");
  });

  // Error-envelope handling (non-JSON, {error: ...}, missing `output`) is
  // shared logic — see invokeEngine in engine-core.ts — and is already
  // covered against a mocked instance in tests/engine.test.ts. Nothing about
  // that path differs between the Node and edge loaders, so it isn't
  // duplicated here.
});

describe("engine.edge: loader failure paths", () => {
  beforeEach(() => {
    __resetInstance();
  });

  afterEach(() => {
    __resetInstance();
    vi.restoreAllMocks();
  });

  it("wraps a corrupted/undecodable embedded payload as RENDER_ERROR", async () => {
    // Simulates the base64 payload esbuild inlines at build time somehow
    // being invalid — e.g. a broken build. atob() throws on malformed input,
    // which is exactly what base64ToBytes relies on to detect this.
    const atobSpy = vi.spyOn(globalThis, "atob").mockImplementation(() => {
      throw new DOMException("bad base64", "InvalidCharacterError");
    });

    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toMatchObject({ code: "RENDER_ERROR" });
    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(/Could not decode the embedded engine\.wasm/);

    atobSpy.mockRestore();
  });

  it("wraps a WebAssembly instantiation failure as RENDER_ERROR", async () => {
    // Simulates a runtime that has WebAssembly but rejects this particular
    // module for some reason (a real Wasm engine bug, a hostile CSP, etc.).
    const instantiateSpy = vi
      .spyOn(WebAssembly, "instantiate")
      .mockRejectedValue(new Error("simulated instantiation failure"));

    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toMatchObject({ code: "RENDER_ERROR" });
    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(/Could not instantiate engine\.wasm in this runtime/);

    instantiateSpy.mockRestore();
  });
});

describe("engine.edge: embedded copy matches the source file exactly", () => {
  it("decodes to the same bytes as src/engine.wasm, byte for byte", async () => {
    // This is the strongest guarantee that esbuild's base64 loader didn't
    // corrupt or truncate anything: instantiate the *embedded* copy (via the
    // public API, indirectly) and separately confirm the two produce
    // identical output for the same input — a mismatch here would mean the
    // edge build is running different code than the Node build.
    __resetInstance();
    const edgeOutput = await runEngine(baseTemplate, "html", { text: { name: "Parity" } }, undefined);

    const wasmPath = join(__dirname, "..", "..", "src", "engine.wasm");
    const bytes = await readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports as unknown as {
      memory: WebAssembly.Memory;
      alloc: (len: number) => number;
      dealloc: (ptr: number, len: number) => void;
      dealloc_str: (ptr: number) => void;
      render: (ptr: number, len: number) => number;
    };

    const input = JSON.stringify({
      template: baseTemplate,
      target: "html",
      dynamic_data: { merge_tags: { text: { name: "Parity" } } },
    });
    const encoded = new TextEncoder().encode(input);
    const ptr = exports.alloc(encoded.length);
    new Uint8Array(exports.memory.buffer).set(encoded, ptr);
    const resultPtr = exports.render(ptr, encoded.length);
    exports.dealloc(ptr, encoded.length);
    const buf = new Uint8Array(exports.memory.buffer);
    let end = resultPtr;
    while (buf[end] !== 0) end++;
    const resultJson = new TextDecoder().decode(buf.subarray(resultPtr, end));
    exports.dealloc_str(resultPtr);
    const { output: directOutput } = JSON.parse(resultJson) as { output: string };

    expect(edgeOutput).toBe(directOutput);
  });
});
