// examples/node/resend.ts
//
// Send a personalized welcome email from a plain Node.js server (or script,
// or queue worker — anywhere Node runs), rendered by @maildeno/renderer and
// delivered by Resend.
//
// Setup
// ─────
//   npm install @maildeno/renderer resend
//   export RESEND_API_KEY=...
//
// See ./README.md for the full walkthrough.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, RenderError } from "@maildeno/renderer";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Node is the one runtime among these examples that can read a template
// straight off disk by path — see ../cloudflare-workers/ and
// ../vercel-edge/ for how this differs where there's no file system.
// (CommonJS projects can use __dirname directly instead of this.)
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "templates");

export async function sendWelcomeEmail(
  email: string,
  firstName: string,
): Promise<void> {
  let html: string;
  try {
    html = await render("welcome.json", {
      baseDir: TEMPLATES_DIR,
      mergeTags: {
        text: { first_name: firstName },
        url: {
          cta_link: `https://app.example.com/onboarding?email=${encodeURIComponent(email)}`,
        },
      },
    });
  } catch (err) {
    if (err instanceof RenderError) {
      throw new Error(`Could not render welcome email (${err.code}): ${err.message}`);
    }
    throw err;
  }

  const { data, error } = await resend.emails.send({
    // Must be a domain (or the resend.dev test address) you've verified
    // with Resend — see https://resend.com/docs/dashboard/domains/introduction.
    from: "Acme <onboarding@yourdomain.com>",
    to: [email],
    subject: `Welcome, ${firstName}!`,
    html,
  });

  if (error) {
    throw new Error(`Resend failed to send: ${error.message}`);
  }

  console.log(`Sent welcome email to ${email} (id: ${data?.id})`);
}
