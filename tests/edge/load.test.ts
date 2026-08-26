// tests/edge/load.test.ts
import { describe, expect, it } from "vitest";

import { RenderError } from "../../src/index.js";
import { resolveTemplate, defaultBaseDir } from "../../src/edge/load.js";

/** Asserts the promise rejects with a RenderError carrying `code`. */
async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(RenderError);
  await expect(p).rejects.toMatchObject({ code });
}

describe("load.edge: string sources", () => {
  it("rejects a string source with TEMPLATE_NOT_FOUND", async () => {
    await expectCode(resolveTemplate("welcome.json", "/"), "TEMPLATE_NOT_FOUND");
  });

  it("names the rejected path and explains there is no file system", async () => {
    const p = resolveTemplate("templates/welcome.json", "/");
    await expect(p).rejects.toThrow(/templates\/welcome\.json/);
    await expect(p).rejects.toThrow(/no file system here/);
  });

  it("rejects a string regardless of baseDir", async () => {
    // Unlike the Node build, baseDir can't rescue a string source here —
    // there's nothing for it to be a boundary around.
    await expectCode(resolveTemplate("x.json", "/anything/at/all"), "TEMPLATE_NOT_FOUND");
  });

  it("rejects an absolute-looking path the same way as a relative one", async () => {
    // Absolute paths are meaningless without a file system too; this build
    // doesn't special-case them the way the Node loader does.
    await expectCode(resolveTemplate("/srv/templates/welcome.json", "/"), "TEMPLATE_NOT_FOUND");
  });
});

describe("load.edge: in-memory templates", () => {
  const validTemplate = {
    template_id: "id",
    template_name: "name",
    canvas: {},
    rows: [],
    schema_version: "1.0.0",
  };

  it("accepts and returns a valid in-memory template unchanged", async () => {
    const result = await resolveTemplate(validTemplate, "/");
    expect(result).toEqual(validTemplate);
  });

  it("still validates in-memory templates — same rules as the Node build", async () => {
    await expectCode(resolveTemplate({ template_id: "x" } as never, "/"), "INVALID_TEMPLATE");
  });

  it("rejects a newer schema major the same way the Node build does", async () => {
    const future = { ...validTemplate, schema_version: "2.0" };
    await expect(resolveTemplate(future, "/")).rejects.toThrow(
      /newer than this renderer supports/,
    );
  });
});

describe("load.edge: defaultBaseDir", () => {
  it("returns a string without touching `process`", () => {
    // The important property: this never references the `process` global,
    // which real browsers don't have. We can't unset `process` from inside
    // Node to prove that directly, but a static check backs this up too —
    // see the sandboxed-execution check in tests/index.edge.test.ts.
    expect(typeof defaultBaseDir()).toBe("string");
  });
});
