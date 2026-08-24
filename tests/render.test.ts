import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  render,
  renderHtml,
  renderMjml,
  renderReactEmail,
  renderToResult,
  RenderError,
} from "../src/index.js";
import type { Template } from "../src/index.js";

const FIXTURES = join(__dirname, "fixtures");

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

describe("render", () => {
  it("renders a template object to HTML", async () => {
    const html = await render(template);
    expect(html).toContain("<html");
    expect(html).toContain("Hello");
  });

  it("renders a template file by path", async () => {
    const html = await render("welcome.json", { baseDir: FIXTURES });
    expect(html).toContain("<html");
  });

  it("substitutes group-qualified merge tags", async () => {
    const html = await render(template, { mergeTags: { text: { name: "Ada" } } });
    expect(html).toContain("Ada");
    expect(html).not.toContain("{{ text.name }}");
  });

  it("strips tags that have no supplied value", async () => {
    // Verified engine behaviour, not an assumption: an unmatched tag is
    // removed rather than left visible. Worth knowing, because a typo'd tag
    // name disappears silently instead of showing up in a test send.
    const html = await render(template);
    expect(html).toContain("Hello");
    expect(html).not.toContain("text.name");
    expect(html).not.toContain("{{");
  });
});

describe("targets", () => {
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

describe("renderToResult", () => {
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

describe("minify", () => {
  it("is on by default and can be disabled", async () => {
    const min = await render(template);
    const raw = await render(template, { minify: false });
    expect(raw.length).toBeGreaterThanOrEqual(min.length);
  });
});
