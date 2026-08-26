// tests/node/load.test.ts
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { render, RenderError } from "../../src/index.js";
import { resolveTemplate } from "../../src/node/load.js";

const FIXTURES = join(__dirname, "..", "fixtures");

async function tmpFile(name: string, contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maildeno-"));
  await writeFile(join(dir, name), contents, "utf8");
  return dir;
}

/** Asserts the promise rejects with a RenderError carrying `code`. */
async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(RenderError);
  await expect(p).rejects.toMatchObject({ code });
}

describe("path resolution", () => {
  it("resolves relative to baseDir", async () => {
    await expect(
      render("welcome.json", { baseDir: FIXTURES }),
    ).resolves.toContain("<html");
  });

  it("names the resolved path when the file is missing", async () => {
    const p = render("nope.json", { baseDir: FIXTURES });
    await expectCode(p, "TEMPLATE_NOT_FOUND");
    await expect(p).rejects.toThrow(FIXTURES);
  });

  it("refuses paths escaping baseDir", async () => {
    await expectCode(
      render("../../../etc/passwd", { baseDir: FIXTURES }),
      "TEMPLATE_NOT_FOUND",
    );
  });

  it("refuses escapes disguised by nesting", async () => {
    await expectCode(
      render("a/b/../../../../etc/passwd", { baseDir: FIXTURES }),
      "TEMPLATE_NOT_FOUND",
    );
  });

  it("honours absolute paths", async () => {
    await expect(render(join(FIXTURES, "welcome.json"))).resolves.toContain(
      "<html",
    );
  });
});

describe("assertTemplate error paths", () => {
  const validTemplate = {
    template_id: "id",
    template_name: "name",
    canvas: {},
    rows: [],
    schema_version: "1.0.0",
  };
  const baseDir = "/base";

  it("rejects a template that is not an object", async () => {
    await expect(resolveTemplate(null as any, baseDir)).rejects.toThrow(
      /is not an object/,
    );
    await expect(resolveTemplate(42 as any, baseDir)).rejects.toThrow(
      /is not an object/,
    );
    await expect(resolveTemplate([], baseDir)).rejects.toThrow(
      /is not an object/,
    );
  });

  it.each([
    [
      "template_id",
      { ...validTemplate, template_id: 123 },
      /template_id must be a string/,
    ],
    [
      "template_name",
      { ...validTemplate, template_name: 123 },
      /template_name must be a string/,
    ],
    [
      "canvas",
      { ...validTemplate, canvas: "not-an-object" },
      /canvas must be an object/,
    ],
    [
      "schema_version",
      { ...validTemplate, schema_version: 123 },
      /schema_version must be a string/,
    ],
  ])("rejects wrong type for %s", async (_field, badTemplate, expected) => {
    await expect(resolveTemplate(badTemplate, baseDir)).rejects.toThrow(
      expected,
    );
  });

  it("rejects a schema_version that does not start with a number", async () => {
    const bad = { ...validTemplate, schema_version: "abc.0.0" };
    await expect(resolveTemplate(bad, baseDir)).rejects.toThrow(
      /is not a valid version/,
    );
  });
});

describe("validation", () => {
  it("rejects malformed JSON", async () => {
    const dir = await tmpFile("bad.json", "{ not json");
    await expectCode(render("bad.json", { baseDir: dir }), "INVALID_TEMPLATE");
  });

  it("rejects a document missing required fields", async () => {
    const dir = await tmpFile(
      "partial.json",
      JSON.stringify({ template_id: "x" }),
    );
    const p = render("partial.json", { baseDir: dir });
    await expectCode(p, "INVALID_TEMPLATE");
    await expect(p).rejects.toThrow(/template_name/);
  });

  it("rejects wrong field types", async () => {
    const dir = await tmpFile(
      "typed.json",
      JSON.stringify({
        template_id: "x",
        template_name: "n",
        canvas: {},
        rows: "should-be-array",
        schema_version: "1.0",
      }),
    );
    await expect(render("typed.json", { baseDir: dir })).rejects.toThrow(
      /rows must be an array/,
    );
  });

  it("rejects a newer schema major", async () => {
    const dir = await tmpFile(
      "future.json",
      JSON.stringify({
        template_id: "x",
        template_name: "n",
        canvas: {},
        rows: [],
        schema_version: "2.0",
      }),
    );
    await expect(render("future.json", { baseDir: dir })).rejects.toThrow(
      /newer than this renderer supports/,
    );
  });

  it("accepts a newer minor of a supported major", async () => {
    const dir = await tmpFile(
      "minor.json",
      JSON.stringify({
        template_id: "x",
        template_name: "n",
        canvas: {},
        rows: [],
        schema_version: "1.7",
      }),
    );
    await expect(render("minor.json", { baseDir: dir })).resolves.toBeTypeOf(
      "string",
    );
  });

  it("validates in-memory templates too", async () => {
    await expectCode(render({ template_id: "x" } as never), "INVALID_TEMPLATE");
  });
});
