# @maildeno/renderer in plain Node.js

Three complete, independent examples — pick the ESP you use. Each exports a
single `sendWelcomeEmail(email, firstName)` function that renders
`templates/welcome.json` and sends it; call it from wherever your app
handles signups (an Express/Fastify route, a queue consumer, a script).

- **`resend.ts`** — using Resend's official SDK
- **`postmark.ts`** — using Postmark's official SDK
- **`aws-ses.ts`** — using the official AWS SDK v3 (`@aws-sdk/client-sesv2`)

Unlike the Cloudflare Workers and Vercel Edge examples, this runs on regular
Node.js, so there's no edge-runtime constraint to work around: every ESP's
official SDK is used directly, and the template is read from disk by path,
the same way the main README's own examples show.

## Setup

1. Install dependencies for whichever example you're using:

   ```bash
   npm install @maildeno/renderer
   npm install resend                   # resend.ts
   npm install postmark                 # postmark.ts
   npm install @aws-sdk/client-sesv2     # aws-ses.ts
   ```

2. Set the relevant environment variables:

   ```bash
   export RESEND_API_KEY=...                  # resend.ts
   export POSTMARK_SERVER_TOKEN=...            # postmark.ts
   export AWS_ACCESS_KEY_ID=...                # aws-ses.ts
   export AWS_SECRET_ACCESS_KEY=...            # aws-ses.ts
   export AWS_REGION=us-east-1                 # aws-ses.ts
   ```

3. Update the `from` / `FromEmailAddress` address in whichever file you're
   using — each ESP requires sending from a domain or address you've
   verified with them first (see the link in that file's header comment).

4. Call it:

   ```ts
   import { sendWelcomeEmail } from "./resend"; // or postmark / aws-ses

   await sendWelcomeEmail("you@example.com", "Noruwa");
   ```

   In a real app this is usually called from wherever a signup completes —
   an Express/Fastify/Next.js API route, a background job after account
   creation, a queue consumer — rather than run standalone.
