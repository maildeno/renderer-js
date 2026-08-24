// src/minify.ts
//
// Whitespace-only compaction for all render targets.
//
// What this does
// --------------
// Collapses redundant whitespace (indentation, blank lines, runs of spaces)
// so the output is compact for transport and delivery.
//
// What this does NOT do
// ---------------------
// - Does not strip or alter HTML/CSS/JS comments
// - Does not remove, add, or change any attribute quotes
// - Does not rewrite attribute values
// - Does not touch CSS property values (including media queries)
// - Does not remove any tags or content

/**
 * Splits an HTML/MJML string into alternating normal markup and special
 * blocks (<style>…</style>, <script>…</script>, <!-- … -->) so we can
 * compact each kind differently without corrupting their contents.
 */
const SPECIAL_BLOCK_RE =
  /(<style[\s>].*?<\/style>|<script[\s>].*?<\/script>|<!--.*?-->)/gis;

function collapseMarkup(source: string): string {
  const parts = source.split(SPECIAL_BLOCK_RE);
  const out: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i % 2 === 1) {
      // Special block (<style>, <script>, or comment) — compact only
      // runs of leading/trailing whitespace per line and consecutive blank
      // lines. Selector/value content untouched.
      let compacted = part.replace(/^[ \t]+|[ \t]+$/gm, "");
      compacted = compacted.replace(/\n{2,}/g, "\n");
      out.push(compacted);
    } else {
      // Normal markup — collapse whitespace between tags and runs of
      // spaces/tabs inside text nodes.
      let segment = part.replace(/>\s+</g, "><"); // between tags
      segment = segment.replace(/[ \t]{2,}/g, " "); // inside text nodes
      segment = segment.replace(/\n+/g, ""); // remove newlines
      out.push(segment);
    }
  }

  return out.join("");
}

// ── Per-target functions ──────────────────────────────────────────────────────

export function minifyHtml(source: string): string {
  if (!source) return source;
  return collapseMarkup(source);
}

export function minifyMjml(source: string): string {
  if (!source) return source;
  return collapseMarkup(source);
}

export function minifyReact(source: string): string {
  if (!source) return source;
  // Strip leading/trailing spaces on each line
  let result = source.replace(/^[ \t]+|[ \t]+$/gm, "");
  // Collapse runs of 3+ newlines to a single blank line
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

// ── Public dispatcher ─────────────────────────────────────────────────────────

/**
 * Route `source` to the correct whitespace compactor for `target`.
 * If target is unknown the original string is returned unchanged.
 */
export function minifyOutput(target: string, source: string): string {
  if (target === "html") return minifyHtml(source);
  if (target === "mjml") return minifyMjml(source);
  if (target === "react-email") return minifyReact(source);
  return source;
}
