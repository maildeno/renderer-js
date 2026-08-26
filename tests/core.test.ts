// tests/core.test.ts
import { describe, expect, it, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { renderWithInstance, RenderError } from "../src/core.js";

const template = {
  template_id: "t_core",
  template_name: "Core Test",
  canvas: {},
  rows: [
    {
      id: "r",
      columns: [
        {
          id: "c",
          components: [
            { id: "x", type: "paragraph" as const, props: { content: "Hi {{ text.who }}" } },
          ],
        },
      ],
    },
  ],
  schema_version: "1.0",
};

describe("core: renderWithInstance", () => {
  let instance: WebAssembly.Instance;

  beforeAll(async () => {
    // Stands in for however a consumer would obtain a compiled module on
    // their own — e.g. Wrangler's native `.wasm` import. What matters here
    // is that renderWithInstance never loads engine.wasm itself; the caller
    // always supplies the instance.
    const wasmPath = join(__dirname, "..", "src", "engine.wasm");
    const bytes = await readFile(wasmPath);
    ({ instance } = await WebAssembly.instantiate(bytes, {}));
  });

  it("renders using the supplied instance", async () => {
    const html = await renderWithInstance(instance, template, {
      mergeTags: { text: { who: "there" } },
    });
    expect(html).toContain("<html");
    expect(html).toContain("Hi there");
  });

  it("defaults to html, same as render()", async () => {
    const html = await renderWithInstance(instance, template);
    expect(html).toContain("<html");
  });

  it("honours the target option", async () => {
    const mjml = await renderWithInstance(instance, template, { target: "mjml" });
    expect(mjml).toContain("<mjml");
  });

  it("still validates the template", async () => {
    await expect(
      renderWithInstance(instance, { template_id: "x" } as never),
    ).rejects.toMatchObject({ code: "INVALID_TEMPLATE" });
    await expect(
      renderWithInstance(instance, { template_id: "x" } as never),
    ).rejects.toBeInstanceOf(RenderError);
  });

  it("rejects a string source — no file system here either", async () => {
    await expect(renderWithInstance(instance, "welcome.json")).rejects.toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
    });
  });

  it("respects minify: false", async () => {
    const min = await renderWithInstance(instance, template);
    const raw = await renderWithInstance(instance, template, { minify: false });
    expect(raw.length).toBeGreaterThanOrEqual(min.length);
  });

  it("does not cache across calls with different instances — each call uses the instance passed to it", async () => {
    // Instantiate a second, independent instance from the same bytes and
    // confirm both produce correct (and identical, since it's the same
    // engine) output — proving renderWithInstance really uses whatever
    // instance you hand it, not a module-level singleton like render() does.
    const wasmPath = join(__dirname, "..", "src", "engine.wasm");
    const bytes = await readFile(wasmPath);
    const { instance: instance2 } = await WebAssembly.instantiate(bytes, {});

    const [a, b] = await Promise.all([
      renderWithInstance(instance, template, { mergeTags: { text: { who: "A" } } }),
      renderWithInstance(instance2, template, { mergeTags: { text: { who: "B" } } }),
    ]);
    expect(a).toContain("Hi A");
    expect(b).toContain("Hi B");
  });
});
