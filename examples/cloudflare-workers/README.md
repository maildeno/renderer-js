# @maildeno/renderer on Cloudflare Workers

Three complete, independent examples — pick the ESP you use. Each is a full
Worker: it accepts a POST request with a recipient's email and first name,
renders the bundled `templates/welcome.json`, and sends it.

- **`resend.ts`** — using Resend's official SDK (confirmed to work in Workers)
- **`postmark.ts`** — using Postmark's REST API directly via `fetch()`
- **`aws-ses.ts`** — using [`aws4fetch`](https://github.com/mhart/aws4fetch) to sign requests to Amazon SES

Each file explains its own choices in a header comment — worth reading if
you're wondering why the AWS or Postmark ones don't just use the official
SDK the way `resend.ts` does.

## Setup

1. Install dependencies for whichever example you're using:

   ```bash
   npm install @maildeno/renderer
   npm install resend            # resend.ts only
   npm install aws4fetch         # aws-ses.ts only
   # postmark.ts needs nothing beyond @maildeno/renderer
   ```

2. Point `wrangler.jsonc`'s `"main"` at the file you're deploying:

   ```jsonc
   { "main": "resend.ts" }
   ```

3. Set secrets — `wrangler secret put` stores these encrypted and separate
   from `wrangler.jsonc`, so they're never committed to source:

   ```bash
   wrangler secret put RESEND_API_KEY           # resend.ts
   wrangler secret put POSTMARK_SERVER_TOKEN     # postmark.ts
   wrangler secret put AWS_ACCESS_KEY_ID         # aws-ses.ts
   wrangler secret put AWS_SECRET_ACCESS_KEY     # aws-ses.ts
   ```

4. Update the `from` / `FromEmailAddress` address in whichever file you're
   using — each ESP requires sending from a domain or address you've
   verified with them first (see the link in that file's header comment).

5. Deploy:

   ```bash
   npx wrangler deploy
   ```

6. Try it:

   ```bash
   curl -X POST https://<your-worker>.workers.dev \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","firstName":"Ada"}'
   ```

## Why the template is a JSON import, not a file path

Cloudflare Workers have no file system — the whole Worker is a single
uploaded script, not a directory you can read from at runtime. So
`render("welcome.json")` doesn't work here; import the parsed template
directly instead, and Wrangler bundles it into the Worker at build time:

```ts
import welcomeTemplate from "./templates/welcome.json";
const html = await render(welcomeTemplate, { mergeTags: { /* ... */ } });
```

If you'd rather edit templates without redeploying, store them in
[Workers KV](https://developers.cloudflare.com/kv/) and fetch them by key
instead of importing them — `render()` treats a parsed KV value the same way
it treats a bundled import; both are just already-parsed objects.
