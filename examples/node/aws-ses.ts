// examples/node/aws-ses.ts
//
// Send a personalized welcome email from a plain Node.js server, rendered by
// @maildeno/renderer and delivered by Amazon SES via the official AWS SDK.
//
// Setup
// ─────
//   npm install @maildeno/renderer @aws-sdk/client-sesv2
//   export AWS_ACCESS_KEY_ID=...
//   export AWS_SECRET_ACCESS_KEY=...
//   export AWS_REGION=us-east-1
//
// See ./README.md for the full walkthrough.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, RenderError } from "@maildeno/renderer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// Credentials and region are picked up automatically from the standard
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION environment
// variables by the SDK's default credential provider chain — no need to
// pass them explicitly.
const ses = new SESv2Client({});

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

  const result = await ses.send(
    new SendEmailCommand({
      // Must be an address on an identity verified with SES — see
      // https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html.
      FromEmailAddress: "onboarding@yourdomain.com",
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: `Welcome, ${firstName}!`, Charset: "UTF-8" },
          Body: { Html: { Data: html, Charset: "UTF-8" } },
        },
      },
    }),
  );

  console.log(`Sent welcome email to ${email} (id: ${result.MessageId})`);
}
