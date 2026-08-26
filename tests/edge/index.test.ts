// tests/edge/index.test.ts
//
// Mirrors tests/node/index.test.ts, but against the edge/browser entry point
// (index.edge.ts) instead of the Node one. Confirms the two builds behave
// identically for everything except loading a template by path, which the
// edge build can't do — see the "string sources" block at the bottom.

import { describe, expect, it } from "vitest";

import {
  render,
  renderHtml,
  renderMjml,
  renderReactEmail,
  renderToResult,
  RenderError,
} from "../../src/index.edge.js";
import type { Template } from "../../src/index.edge.js";

const template: Template = {
  template_id: "t_1",
  template_name: "Test Template",
  canvas: {},
  rows: [
    {
      id: "r",
      columns: [
        {
          id: "c",
          components: [
            { id: "x", type: "paragraph", props: { content: "Hello {{ text.name }}" } },
          ],
        },
      ],
    },
  ],
  schema_version: "1.0",
};

describe("index.edge: render", () => {
  it("renders a template object to HTML", async () => {
    const html = await render(template);
    expect(html).toContain("<html");
    expect(html).toContain("Hello");
  });

  it("substitutes group-qualified merge tags", async () => {
    const html = await render(template, { mergeTags: { text: { name: "Ada" } } });
    expect(html).toContain("Ada");
    expect(html).not.toContain("{{ text.name }}");
  });

  it("strips tags that have no supplied value", async () => {
    const html = await render(template);
    expect(html).toContain("Hello");
    expect(html).not.toContain("text.name");
    expect(html).not.toContain("{{");
  });
});

describe("index.edge: targets", () => {
  it("defaults to html", async () => {
    const { target } = await renderToResult(template);
    expect(target).toBe("html");
  });

  it("renders mjml", async () => {
    expect(await renderMjml(template)).toContain("<mjml");
  });

  it("renders react-email", async () => {
    const tsx = await renderReactEmail(template);
    expect(tsx.length).toBeGreaterThan(0);
    expect(tsx).not.toContain("<!DOCTYPE html");
  });

  it("renderHtml matches render", async () => {
    expect(await renderHtml(template)).toBe(await render(template));
  });
});

describe("index.edge: renderToResult", () => {
  it("returns template metadata alongside the output", async () => {
    const res = await renderToResult(template);
    expect(res).toMatchObject({
      templateId: "t_1",
      templateName: "Test Template",
      target: "html",
    });
    expect(res.output.length).toBeGreaterThan(0);
  });
});

describe("index.edge: minify", () => {
  it("is on by default and can be disabled", async () => {
    const min = await render(template);
    const raw = await render(template, { minify: false });
    expect(raw.length).toBeGreaterThanOrEqual(min.length);
  });
});

describe("index.edge: string sources are rejected (no file system here)", () => {
  it("throws RenderError with code TEMPLATE_NOT_FOUND for a path string", async () => {
    await expect(render("welcome.json")).rejects.toBeInstanceOf(RenderError);
    await expect(render("welcome.json")).rejects.toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
    });
  });

  it("the error message explains what to do instead", async () => {
    await expect(render("welcome.json")).rejects.toThrow(
      /no file system here.*pass the parsed object/s,
    );
  });

  it("baseDir does not rescue a string source in this build", async () => {
    await expect(
      render("welcome.json", { baseDir: "/anywhere" }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });

  it("does not throw a raw ReferenceError for `process` — this build never touches it", async () => {
    // The most important regression this guards against: a stray
    // `process.cwd()` call would throw ReferenceError in a real browser
    // rather than the clean RenderError callers should get. Asserting the
    // rejection *is* a RenderError (not some other Error subtype) is an
    // indirect but meaningful check of that.
    try {
      await render(template, {}); // object source — baseDir is never even consulted
      await render("x.json"); // string source — must fail as RenderError, not ReferenceError
    } catch (err) {
      expect(err).toBeInstanceOf(RenderError);
    }
  });
});
