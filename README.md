# @maildeno/renderer

Render Maildeno email templates to HTML, MJML or React Email — locally. No
API calls, no API key, no network. Works the same way in Node, in a browser,
and in edge runtimes like Cloudflare Workers and Vercel Edge.

Rendering runs in an embedded WebAssembly engine, so output is byte-identical
to Maildeno's hosted renderer — the same engine everywhere, whether that's
`engine.wasm` read from disk in Node or the same bytes embedded in the
browser/edge build.

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

That's the whole API for the common case: a path in, a string out. (In a
browser or edge runtime, pass an already-parsed template instead of a path —
see [Browsers and edge runtimes](#browsers-and-edge-runtimes).)

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
| `baseDir` | `process.cwd()` | Directory relative paths resolve against. **Node only** — ignored (and irrelevant) in the browser/edge build, which never resolves a path in the first place. See [Browsers and edge runtimes](#browsers-and-edge-runtimes). |

## Paths

*(This section describes the Node build. In browsers and edge runtimes there
is no file system, so `source` must always be an already-parsed template —
see [Browsers and edge runtimes](#browsers-and-edge-runtimes).)*

Relative paths resolve against `baseDir`, which defaults to the process working
directory. Absolute paths are always honoured.

```ts
await render("welcome.json", { baseDir: "/srv/app/templates" });
await render("/srv/app/templates/welcome.json");
```

**If a template name ever comes from user input, set `baseDir`.** It acts as a
boundary — paths resolving outside that directory are rejected.

```ts
await render("../outside-template.json", {
  baseDir: "/srv/app/templates",
});
```

The check compares resolved paths rather than scanning for `..`, so encoded
traversal and symlinks are covered too.

## Browsers and edge runtimes

The same import works unchanged in Node, browsers, Cloudflare Workers, Vercel
Edge Middleware/Functions, and Deno — no separate package to install, no
bundler configuration to write:

```ts
import { render } from "@maildeno/renderer";
```

Your bundler picks the right build automatically via `package.json`'s
[conditional exports](https://nodejs.org/api/packages.html#conditional-exports).
Node gets a build that reads `engine.wasm` from disk, exactly as before.
Everywhere else gets a build with `engine.wasm` embedded as a base64 string —
so it's still one `npm install`, still zero network calls, still nothing to
deploy alongside it as a separate asset.

**The one behavioural difference:** the browser/edge build only accepts an
already-parsed template, not a path — there's no file system to read a path
from.

```ts
// Node: both of these work
await render("templates/welcome.json");
await render(templateObject);

// Browser / Cloudflare Workers / Vercel Edge: only this works
await render(templateObject);
```

Read the template however makes sense for your runtime — `fetch()`, a KV/R2/
Durable Object binding, a bundler JSON import — and pass the parsed object in.
A string `source` throws `RenderError` with code `TEMPLATE_NOT_FOUND` and a
message telling you what to do instead, rather than failing with something
like "fs is not defined".

```ts
// Cloudflare Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const template = await env.TEMPLATES.get("welcome", "json"); // KV binding
    const html = await render(template, {
      mergeTags: { text: { first_name: "Ada" } },
    });
    return new Response(html, { headers: { "content-type": "text/html" } });
  },
};
```

Every other option, and every error code, behaves identically to the Node
build.

### Supported runtimes

| Runtime | How it's selected |
| --- | --- |
| Node 20+ | the `node` export condition |
| Cloudflare Workers | the `workerd` condition — Wrangler sets this automatically, no config needed |
| Vercel Edge Runtime | the `edge-light` condition |
| Browsers, via a bundler | the `browser` condition |
| Deno | the `deno` condition |
| Anything else / a fully neutral bundler | falls back to the browser/edge build — the conservative default, since it makes no assumptions about what's available |

### Bundle size

Embedding `engine.wasm` as base64 adds about 90 KB brotli-compressed to your
build (worth comparing against, say, Cloudflare's multi-MB Worker size
limits — this is rarely the constraint). If it ever is, and your bundler can
hand you a compiled Wasm module more directly — for example
[Wrangler's native `.wasm` import](https://developers.cloudflare.com/workers/wrangler/bundling/),
which uploads it as a separate module instead of inlining it —
`@maildeno/renderer/core` skips the embedded copy and takes an instance you
supply instead:

```ts
import mod from "@maildeno/renderer/engine.wasm"; // resolved by Wrangler to a WebAssembly.Module
import { renderWithInstance } from "@maildeno/renderer/core";

const instance = await WebAssembly.instantiate(mod, {});
const html = await renderWithInstance(instance, templateObject);
```

This is a niche optimisation most deployments won't need — reach for `render`
first, and only look at `renderWithInstance` if bundle size actually becomes
a problem. (This shape follows Wrangler's own documented `.wasm`-import
behaviour; worth a quick smoke test in your own deployment before relying on
it, the way you would for any bundler-specific import.)

### Full examples

[`examples/`](./examples) has complete, runnable Workers/Edge Function/Node
code — one folder per runtime, one file per email provider (Resend, Postmark,
Amazon SES) — including the ESP-specific parts this README doesn't cover,
like signing requests to SES from a runtime the AWS SDK doesn't support well.

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
| `TEMPLATE_NOT_FOUND` | File missing, unreadable, or outside `baseDir` (Node) — or `source` was a path string in the browser/edge build, which has no file system to read one from |
| `INVALID_TEMPLATE` | Not valid JSON, or not a valid template document |
| `RENDER_ERROR` | The engine failed, or `engine.wasm` couldn't be loaded/instantiated |

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

For Postmark, Amazon SES, or a Cloudflare Workers / Vercel Edge deployment of
any of the three, see [`examples/`](./examples).

## Requirements

Node 20+, or any modern browser, or an edge runtime such as Cloudflare
Workers, Vercel Edge, or Deno — see
[Browsers and edge runtimes](#browsers-and-edge-runtimes). It's the same
package and the same import either way; the right build is selected for you.

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
