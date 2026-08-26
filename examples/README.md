# @maildeno/renderer examples

Full, runnable examples of rendering a template and sending it through a
real email provider, across the runtimes this package supports.

|                                                   | [Resend](https://resend.com)   | [Postmark](https://postmarkapp.com) | [Amazon SES](https://aws.amazon.com/ses/) |
| ------------------------------------------------- | ------------------------------ | ----------------------------------- | ----------------------------------------- |
| **[`node/`](./node)** — plain Node.js             | official SDK                   | official SDK                        | official SDK (`@aws-sdk/client-sesv2`)    |
| **[`cloudflare-workers/`](./cloudflare-workers)** | official SDK (edge-compatible) | REST API via `fetch()`              | `aws4fetch`                               |
| **[`vercel-edge/`](./vercel-edge)**               | official SDK (edge-compatible) | REST API via `fetch()`              | `aws4fetch`                               |

Each folder is independent and has its own README with setup steps. The
three ESP files within a folder all do the same thing — render
`templates/welcome.json`, personalize it, send it — so you only need the one
matching your provider.

## Why the ESP integration code differs by runtime

`@maildeno/renderer` itself behaves identically everywhere (see the main
[README](../README.md#browsers-and-edge-runtimes)) — this isn't about the
renderer. It's that Cloudflare Workers and Vercel's Edge Runtime don't have a
file system or full Node.js compatibility, and not every ESP's SDK is built
for that:

- **Resend**'s SDK is fetch-based and confirmed to work in Workers — Resend
  publishes an
  [official Cloudflare Workers example](https://github.com/resend/resend-cloudflare-workers-example) —
  so the edge examples use it directly, the same as Node does.
- **Postmark**'s official SDK is built around Node's `https` module, which
  isn't available at the edge. Its REST API is a single plain POST request
  though, so the edge examples call it with `fetch()` directly instead — see
  the comment at the top of each `postmark.ts`.
- **AWS SDK v3** has real, documented problems in restricted runtimes like
  these (it reaches for `DOMParser`, among other browser/Node-specific
  assumptions it makes internally). The edge examples use
  [`aws4fetch`](https://github.com/mhart/aws4fetch) instead — a small
  fetch + Web Crypto based AWS request signer that Cloudflare's own docs
  recommend for exactly this situation.

## Templates: a JSON import vs. a file path

Node reads `templates/welcome.json` off disk by path, same as the main
README's own examples. Cloudflare Workers and Vercel Edge Functions have no
disk to read from, so those two import the same template as a JSON module
instead — see each folder's README for specifics. Either way, `render()`
ends up called with a parsed object; the difference is only in how that
object gets there.

## A note on accuracy

The renderer's own behaviour (what's in `../src/`) is verified by this
repo's test suite against the real compiled engine. The ESP integration code
here — the exact request shapes for Resend, Postmark and SES, and which
runtimes each SDK is confirmed to work in — is based on each provider's
current public documentation and, for Resend on Cloudflare specifically,
their official example repo.
