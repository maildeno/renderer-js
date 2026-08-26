// examples/vercel-edge/aws-ses.ts
//
// Send a personalized welcome email from a Vercel Edge Function, rendered by
// @maildeno/renderer and delivered by Amazon SES.
//
// Save this as app/api/send-welcome/route.ts in a Next.js App Router
// project. This uses aws4fetch rather than the official @aws-sdk/client-sesv2
// — the AWS SDK v3 has real, documented problems in restricted runtimes like
// this one (it reaches for browser APIs like DOMParser, and some signing
// paths require Node specifically:
// https://github.com/aws/aws-sdk-js-v3/discussions/6284). Cloudflare's own
// R2 docs recommend aws4fetch as the working alternative for the same class
// of environment: https://developers.cloudflare.com/r2/examples/aws/aws4fetch/.
// aws4fetch is a small fetch() + Web Crypto (SubtleCrypto) SigV4 signer —
// both available on the Edge Runtime — and isn't S3-specific: SES's
// SendEmail is just another SigV4-signed REST call once you're not tied to
// the SDK's transport. See ../node/aws-ses.ts for the official-SDK version,
// a better fit for Vercel's default (Node) Function runtime.
//
// SES v2 SendEmail reference:
//   https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
// SES regional endpoints:
//   https://docs.aws.amazon.com/general/latest/gr/ses.html
//
// Setup
// ─────
//   npm install @maildeno/renderer aws4fetch
//   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your Vercel
//   project's Environment Variables
//   vercel deploy
//
// See ./README.md for the full walkthrough, including verifying a sender
// identity and moving SES out of its sandbox.

import { render, RenderError } from "@maildeno/renderer";
import { AwsClient } from "aws4fetch";
import welcomeTemplate from "./templates/welcome.json";

export const runtime = "edge";

interface SendRequest {
  email: string;
  firstName: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: SendRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email || !body.firstName) {
    return Response.json(
      { error: "email and firstName are required" },
      { status: 400 },
    );
  }

  let html: string;
  try {
    html = await render(welcomeTemplate, {
      mergeTags: {
        text: { first_name: body.firstName },
        url: {
          cta_link: `https://app.example.com/onboarding?email=${encodeURIComponent(body.email)}`,
        },
      },
    });
  } catch (err) {
    if (err instanceof RenderError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: 500 },
      );
    }
    throw err;
  }

  const region = process.env.AWS_REGION ?? "us-east-1";
  // service/region are passed explicitly rather than left to aws4fetch's
  // URL-based auto-detection — SES's SigV4 service name ("ses") doesn't
  // match its hostname's first label ("email"), so relying on that
  // detection here would risk a mismatched, rejected signature.
  const aws = new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    service: "ses",
    region,
  });

  const sesResponse = await aws.fetch(
    `https://email.${region}.amazonaws.com/v2/email/outbound-emails`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Must be an address on an identity verified with SES — see
        // https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html.
        FromEmailAddress: "onboarding@yourdomain.com",
        Destination: { ToAddresses: [body.email] },
        Content: {
          Simple: {
            Subject: { Data: `Welcome, ${body.firstName}!`, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
          },
        },
      }),
    },
  );

  if (!sesResponse.ok) {
    const errorBody = await sesResponse.text();
    return Response.json(
      { error: "ses_error", status: sesResponse.status, message: errorBody },
      { status: 502 },
    );
  }

  const result = (await sesResponse.json()) as { MessageId?: string };
  return Response.json({ sent: true, id: result.MessageId });
}
