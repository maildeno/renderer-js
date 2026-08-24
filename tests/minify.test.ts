// tests/minify.test.ts
import { describe, expect, it } from "vitest";
import { minifyOutput } from "../src/minify.js";

describe("minifyOutput fallback", () => {
  it("returns source unchanged for an unknown target", () => {
    const raw = "  <p>hi</p>  \n\n  ";
    expect(minifyOutput("pdf" as any, raw)).toBe(raw);
    expect(minifyOutput("text" as any, " hello ")).toBe(" hello ");
  });
});
