// tests/engine.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { runEngine, __resetInstance } from "../../src/node/engine.js";
import { RenderError } from "../../src/error.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

function createFakeWasmInstance({
  renderResult = '{"output":"ok"}',
  heapPeak = 0,
}: {
  renderResult?: string;
  heapPeak?: number;
} = {}) {
  const memory = new WebAssembly.Memory({ initial: 1 });

  const alloc = vi.fn((_len: number) => 0);
  const dealloc = vi.fn();
  const dealloc_str = vi.fn();

  const render = vi.fn((_ptr: number, _len: number) => {
    const encoded = new TextEncoder().encode(renderResult + "\0");
    new Uint8Array(memory.buffer).set(encoded, 1024);
    return 1024;
  });

  const heap_peak = vi.fn(() => heapPeak);

  const exports = {
    memory,
    alloc,
    dealloc,
    dealloc_str,
    render,
    heap_peak,
  };

  return { exports, memory, render, heap_peak };
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return {
    ...actual,
    readFile: vi.fn(),
  };
});

const instantiateSpy = vi.spyOn(WebAssembly, "instantiate");

describe("engine.ts edge cases", () => {
  const baseTemplate = {
    template_id: "id",
    template_name: "name",
    canvas: {},
    rows: [],
    schema_version: "1.0.0",
  };

  beforeEach(() => {
    __resetInstance();
    vi.mocked(readFile).mockResolvedValue(Buffer.from("dummy"));
    instantiateSpy.mockImplementation(async () => {
      const { exports } = createFakeWasmInstance();
      return { instance: { exports } } as any;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    __resetInstance();
  });


  it("throws RENDER_ERROR when engine.wasm cannot be read", async () => {
    // Make readFile reject for ALL calls in this test
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(RenderError);
    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(/Could not load engine\.wasm/);
  });


  it("logs a warning when heap_peak exceeds 9 MB", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { exports } = createFakeWasmInstance({
      renderResult: '{"output":"ok"}',
      heapPeak: 10 * 1024 * 1024,
    });
    instantiateSpy.mockImplementation(async () => ({
      instance: { exports },
    }));

    await runEngine(baseTemplate, "html", undefined, undefined);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/heap usage high: 10\.00 MB/),
    );
    warnSpy.mockRestore();
  });


  it("throws when engine returns non‑JSON", async () => {
    const { exports } = createFakeWasmInstance({
      renderResult: "not json at all",
    });
    instantiateSpy.mockImplementation(async () => ({
      instance: { exports },
    }));

    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(RenderError);
    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(/Engine returned non-JSON/);
  });


  it("throws when engine returns an error envelope", async () => {
    const { exports } = createFakeWasmInstance({
      renderResult: '{"error":"something went wrong"}',
    });
    instantiateSpy.mockImplementation(async () => ({
      instance: { exports },
    }));

    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(RenderError);
    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(/something went wrong/);
  });


  it('throws when engine response lacks an "output" field', async () => {
    const { exports } = createFakeWasmInstance({
      renderResult: '{"foo":"bar"}',
    });
    instantiateSpy.mockImplementation(async () => ({
      instance: { exports },
    }));

    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(RenderError);
    await expect(
      runEngine(baseTemplate, "html", undefined, undefined),
    ).rejects.toThrow(/missing 'output' field/);
  });
});
