# @maildeno/renderer on Vercel Edge Functions

Three complete, independent examples — pick the ESP you use. Each is a
Next.js App Router route handler running on the
[Edge Runtime](https://vercel.com/docs/functions/runtimes/edge): it accepts
a POST request with a recipient's email and first name, renders the bundled
`templates/welcome.json`, and sends it.

- **`resend.ts`** — using Resend's official SDK
- **`postmark.ts`** — using Postmark's REST API directly via `fetch()`
- **`aws-ses.ts`** — using [`aws4fetch`](https://github.com/mhart/aws4fetch) to sign requests to Amazon SES

Each file explains its own choices in a header comment — worth reading if
you're wondering why the AWS or Postmark ones don't just use the official
SDK the way `resend.ts` does.

## Setup

1. In an existing Next.js (App Router) project, save whichever file you're
   using as `app/api/send-welcome/route.ts`, and copy `templates/welcome.json`
   alongside it (e.g. `app/api/send-welcome/templates/welcome.json`) —
   adjust the import path at the top of the file if you put it elsewhere.

   `export const runtime = "edge";` is what puts the route on the Edge
   Runtime instead of Vercel's default Node runtime.

2. Install dependencies for whichever example you're using:

   ```bash
   npm install @maildeno/renderer
   npm install resend            # resend.ts only
   npm install aws4fetch         # aws-ses.ts only
   # postmark.ts needs nothing beyond @maildeno/renderer
   ```

3. Set environment variables in your Vercel project (**Project → Settings →
   Environment Variables**), or in `.env.local` for local dev:

   ```
   RESEND_API_KEY=...                # resend.ts
   POSTMARK_SERVER_TOKEN=...          # postmark.ts
   AWS_ACCESS_KEY_ID=...              # aws-ses.ts
   AWS_SECRET_ACCESS_KEY=...          # aws-ses.ts
   ```

4. Update the `from` / `FromEmailAddress` address in whichever file you're
   using — each ESP requires sending from a domain or address you've
   verified with them first (see the link in that file's header comment).

5. Deploy (`vercel deploy`, or push to your connected Git branch), then try
   it:

   ```bash
   curl -X POST https://<your-app>.vercel.app/api/send-welcome \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","firstName":"Ada"}'
   ```

## Why the template is a JSON import, not a file path

The Edge Runtime has no file system — `render("welcome.json")` doesn't work
here. Import the parsed template directly instead, same as the Cloudflare
Workers examples:

```ts
import welcomeTemplate from "./templates/welcome.json";
const html = await render(welcomeTemplate, { mergeTags: { /* ... */ } });
```

## Using the Node runtime instead

None of this — the JSON import, `aws4fetch`, avoiding the `postmark`
package — is necessary if you don't need the Edge Runtime specifically.
Vercel's default Function runtime is regular Node.js: drop
`export const runtime = "edge"` and use `../node/*.ts` instead, which reads
the template from a real file path and uses the official SDK for every
provider.
