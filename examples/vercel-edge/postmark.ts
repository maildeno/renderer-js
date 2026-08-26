// examples/vercel-edge/postmark.ts
//
// Send a personalized welcome email from a Vercel Edge Function, rendered by
// @maildeno/renderer and delivered by Postmark.
//
// Save this as app/api/send-welcome/route.ts in a Next.js App Router
// project. This calls Postmark's REST API directly with fetch() rather than
// the `postmark` npm package — that package is built around Node's `https`
// module, which isn't available on the Edge Runtime; the REST API itself is
// a single plain POST request, which fetch() handles natively. See
// ../node/postmark.ts for the SDK-based version, a better fit for Vercel's
// default (Node) Function runtime.
//
// API reference: https://postmarkapp.com/developer/api/email-api
//
// Setup
// ─────
//   npm install @maildeno/renderer
//   Set POSTMARK_SERVER_TOKEN in your Vercel project's Environment Variables
//   vercel deploy
//
// See ./README.md for the full walkthrough.

import { render, RenderError } from "@maildeno/renderer";
import welcomeTemplate from "./templates/welcome.json";

export const runtime = "edge";

interface SendRequest {
  email: string;
  firstName: string;
}

interface PostmarkResponse {
  MessageID?: string;
  ErrorCode: number;
  Message: string;
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

  const postmarkResponse = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN!,
    },
    body: JSON.stringify({
      // Must be an address on a domain you've verified with Postmark — see
      // https://postmarkapp.com/support/article/1046-how-do-i-verify-my-sending-domains.
      From: "onboarding@yourdomain.com",
      To: body.email,
      Subject: `Welcome, ${body.firstName}!`,
      HtmlBody: html,
      MessageStream: "outbound",
    }),
  });

  const result = (await postmarkResponse.json()) as PostmarkResponse;

  // Postmark returns a non-2xx status for auth/validation failures (401,
  // 422, ...), but a 200 with a non-zero ErrorCode for some per-message
  // failures — check both.
  if (!postmarkResponse.ok || result.ErrorCode !== 0) {
    return Response.json(
      { error: "postmark_error", code: result.ErrorCode, message: result.Message },
      { status: 502 },
    );
  }

  return Response.json({ sent: true, id: result.MessageID });
}
