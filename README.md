# @maildeno/renderer

Render Maildeno email templates to HTML, MJML or React Email — locally, from a
JSON file. No API calls, no API key, no network.

Rendering runs in an embedded WebAssembly engine, so output is byte-identical
to Maildeno's hosted renderer.

```bash
npm install @maildeno/renderer
```

```ts
import { render } from "@maildeno/renderer";

const html = await render("templates/welcome.json", {
  mergeTags: { text: { first_name: "Noruwa" } },
  context: { plan: "premium" },
});
```

That's the whole API for the common case: a path in, a string out.

---

## Templates

Export a template from the Maildeno editor (**Export → JSON**) and save the
file. No conversion needed — the editor's export format is exactly what the
renderer consumes:

```json
{
  "template_id": "welcome_to_premium",
  "template_name": "Welcome to Premium",
  "canvas": { },
  "rows": [ ],
  "schema_version": "1.0"
}
```

Name the file whatever suits you — `welcome.json`, or the template's UUID.

## Rendering

```ts
import {
  render,          // → string (HTML by default)
  renderHtml,
  renderMjml,
  renderReactEmail,
  renderToResult,  // → { output, templateId, templateName, target }
} from "@maildeno/renderer";

await render("welcome.json");                        // HTML
await renderMjml("welcome.json");                    // MJML
await renderReactEmail("welcome.json");              // React Email .tsx
await render("welcome.json", { target: "mjml" });    // same, dynamic target

const { output, templateName } = await renderToResult("welcome.json");
```

Every function accepts either a **path** or an **already-parsed template**:

```ts
const template = await db.templates.findById(id);   // straight from your DB
const html = await render(template);                 // no file I/O
```

## Merge tags

**Tag names in the template must be group-qualified** — `{{ text.first_name }}`,
not `{{ first_name }}`. The prefix tells the engine how to escape the value,
and an unprefixed tag will not resolve.

```ts
await render("welcome.json", {
  mergeTags: {
    text: { first_name: "Ada", plan: "Premium" },   // visible text
    url:  { cta: "https://app.example.com/start" }, // href / src — URL-encoded
    attr: { hero_alt: "Product screenshot" },       // attributes — HTML-escaped
  },
});
```

| Group | Substituted into | Escaping |
| --- | --- | --- |
| `text` | Paragraphs, headings, buttons, list items | HTML-escaped |
| `url` | `href`, `src` | URL-encoded |
| `attr` | HTML attribute values | HTML-escaped |

The grouping is not cosmetic. A URL placed in `text` is HTML-escaped rather
than URL-encoded, and will break for any value containing `&`.

> **A tag with no supplied value is removed, not left visible.** A typo in a tag
> name disappears silently rather than showing up in a test send, so it's worth
> asserting on rendered output in tests when a value must be present.

## Context and conditional content

Rows and blocks can carry visibility rules set in the editor. `context` supplies
the values those rules are evaluated against:

```ts
await render("welcome.json", {
  context: { plan: "premium", country: "NG", is_trial: false },
});
```

Content whose conditions don't match is omitted from the output entirely — the
rendered email contains only what that recipient should see.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `target` | `"html"` | `"html"`, `"mjml"` or `"react-email"` |
| `mergeTags` | — | `{ text?, url?, attr? }` |
| `context` | — | Values for visibility rules |
| `minify` | `true` | Collapse redundant whitespace. Structure, comments and attribute quoting are untouched. |
| `baseDir` | `process.cwd()` | Directory relative paths resolve against |

## Paths

Relative paths resolve against `baseDir`, which defaults to the process working
directory. Absolute paths are always honoured.

```ts
await render("welcome.json", { baseDir: "/srv/app/templates" });
await render("/srv/app/templates/welcome.json");
```


Replace it with something less scanner-sensitive:

```markdown
**If a template name ever comes from user input, set `baseDir`.** It acts as a
boundary — paths resolving outside that directory are rejected.

```ts
await render("../outside-template.json", {
  baseDir: "/srv/app/templates",
});
```

The check compares resolved paths rather than scanning for `..`, so encoded
traversal and symlinks are covered too.

## Errors

Everything throws `RenderError` with a `code`:

```ts
import { render, RenderError } from "@maildeno/renderer";

try {
  const html = await render("welcome.json");
} catch (err) {
  if (err instanceof RenderError) {
    console.error(err.code, err.message);
  }
}
```

| Code | Meaning |
| --- | --- |
| `TEMPLATE_NOT_FOUND` | File missing, unreadable, or outside `baseDir` |
| `INVALID_TEMPLATE` | Not valid JSON, or not a valid template document |
| `RENDER_ERROR` | The engine failed, or `engine.wasm` couldn't be loaded |

Templates are validated before rendering — missing fields, wrong types and
unsupported schema versions are reported by name, rather than surfacing as an
opaque failure from inside the engine. A missing-file error names the *resolved*
path, since the useful question is usually which directory was searched.

Schema versions are compared on the major only. `1.7` renders fine under a
`1.x` renderer; `2.0` is rejected with a message telling you to upgrade.

## In practice

```ts
import { render } from "@maildeno/renderer";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcome(user: User) {
  const html = await render("templates/welcome.json", {
    baseDir: process.env.TEMPLATE_DIR,
    mergeTags: {
      text: { first_name: user.firstName, plan: user.plan },
      url:  { cta: `https://app.example.com/onboarding?u=${user.id}` },
    },
    context: { plan: user.plan, is_trial: user.isTrial },
  });

  await resend.emails.send({
    from: "hello@example.com",
    to: user.email,
    subject: `Welcome, ${user.firstName}`,
    html,
  });
}
```

Rendering is local and synchronous in practice — no rate limits, no timeouts,
and nothing to mock in tests. Rendering per-recipient in a loop is fine.

## Requirements

Node 20+. This package reads `engine.wasm` from disk via `node:fs`, so it does
not run in browsers or edge runtimes that lack filesystem access. A browser
build is possible — the engine itself is portable — but isn't in this release.

## Migrating from the `maildeno` SDK

```ts
// Before — fetched over the network
const client = new MaildenoClient({ apiKey: process.env.MAILDENO_API_KEY });
const { output } = await client.render({
  templateId: "welcome",
  target: "html",
  dynamicData: { merge_tags: { text: { name: "Noruwa" } } },
});

// After — local file
const output = await render("templates/welcome.json", {
  mergeTags: { text: { name: "Noruwa" } },
});
```

Removed with no replacement, because none of it applies to local files:
`apiKey`, `baseUrl`, `timeout`, all caching (`cache`, `listCached`,
`deleteCached`, `clearCache`, `invalidate`), `fromStaleCache`, and the network
error codes `INVALID_API_KEY`, `FORBIDDEN`, `NETWORK_ERROR` and `TIMEOUT`.

`dynamicData: { merge_tags, context }` is now `mergeTags` and `context` at the
top level.

## License

MIT
