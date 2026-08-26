// examples/node/postmark.ts
//
// Send a personalized welcome email from a plain Node.js server, rendered by
// @maildeno/renderer and delivered by Postmark's official SDK.
//
// Setup
// ─────
//   npm install @maildeno/renderer postmark
//   export POSTMARK_SERVER_TOKEN=...
//
// See ./README.md for the full walkthrough.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, RenderError } from "@maildeno/renderer";
import * as postmark from "postmark";

const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN!);

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

  const result = await client.sendEmail({
    // Must be an address on a domain you've verified with Postmark — see
    // https://postmarkapp.com/support/article/1046-how-do-i-verify-my-sending-domains.
    From: "onboarding@yourdomain.com",
    To: email,
    Subject: `Welcome, ${firstName}!`,
    HtmlBody: html,
    MessageStream: "outbound",
  });

  console.log(`Sent welcome email to ${email} (id: ${result.MessageID})`);
}
