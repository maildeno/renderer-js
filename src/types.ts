// src/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public types for @maildeno/renderer.
// ─────────────────────────────────────────────────────────────────────────────

/** Output format. */
export type Target = "html" | "mjml" | "react-email";

/**
 * A Maildeno template document.
 *
 * This is exactly what the editor's JSON export produces — the same five keys,
 * unchanged — so an exported file can be passed straight to the renderer with
 * no transformation.
 */
export interface Template {
  template_id: string;
  template_name: string;
  /** Canvas-level settings (global padding, background colour, and so on). */
  canvas: Record<string, unknown>;
  /** Ordered row definitions. */
  rows: unknown[];
  /** Schema version. The major must match what this renderer supports. */
  schema_version: string;
}

/**
 * Merge tag values, grouped by where they are substituted.
 *
 * The grouping is not cosmetic — the engine escapes each group differently, so
 * putting a URL in `text` would leave it HTML-escaped rather than URL-encoded.
 */
export interface MergeTags {
  /** Substituted into visible text (paragraphs, headings, buttons, lists). */
  text?: Record<string, string>;
  /** Substituted into `href` / `src`. Values are URL-encoded. */
  url?: Record<string, string>;
  /** Substituted into HTML attribute values. Values are HTML-escaped. */
  attr?: Record<string, string>;
}

/** Values that visibility rules are evaluated against. */
export type Context = Record<string, string | number | boolean>;

export interface RenderOptions {
  /** Output format. @default "html" */
  target?: Target;
  /** Merge tag values, grouped by substitution site. */
  mergeTags?: MergeTags;
  /** Values for visibility rules. */
  context?: Context;
  /**
   * Collapse redundant whitespace in the output.
   *
   * Whitespace-only: comments, attribute quoting and structure are untouched.
   * @default true
   */
  minify?: boolean;
  /**
   * Directory that relative template paths resolve against.
   *
   * Also acts as a boundary — when set, a path resolving outside it is
   * rejected rather than read, so a user-supplied template name can't be
   * turned into an arbitrary file read.
   *
   * @default process.cwd()
   */
  baseDir?: string;
}

/** Returned by `renderToResult` when you want more than the output string. */
export interface RenderResult {
  /** The rendered output (HTML, MJML, or React Email `.tsx` source). */
  output: string;
  templateId: string;
  templateName: string;
  target: Target;
}

/**
 * Accepted by every render function.
 *
 * A path is read and parsed; an already-parsed template skips I/O entirely,
 * which covers templates held in a database, generated in memory, or imported
 * by a bundler.
 */
export type TemplateSource = string | Template;
