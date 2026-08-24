// src/error.ts
// ─────────────────────────────────────────────────────────────────────────────
// The single error type this package throws.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Machine-readable failure reasons.
 *
 */
export type RenderErrorCode =
  /** The path could not be read, or resolved outside `baseDir`. */
  | "TEMPLATE_NOT_FOUND"
  /** The file was not valid JSON, or not a valid template document. */
  | "INVALID_TEMPLATE"
  /** The engine could not be loaded, or reported a failure. */
  | "RENDER_ERROR";

export class RenderError extends Error {
  readonly code: RenderErrorCode;
  /** The underlying error, when this wraps one. Narrows Error.cause. */
  override readonly cause?: unknown;

  constructor(code: RenderErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "RenderError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
    // Keeps `instanceof` working when compiled down to ES5.
    Object.setPrototypeOf(this, RenderError.prototype);
  }
}
