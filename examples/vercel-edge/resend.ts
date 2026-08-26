// examples/vercel-edge/resend.ts
//
// Send a personalized welcome email from a Vercel Edge Function, rendered by
// @maildeno/renderer and delivered by Resend.
//
// Save this as app/api/send-welcome/route.ts in a Next.js App Router
// project (adjust the "./templates/welcome.json" import path to match
// wherever you put templates/ relative to it). The `runtime = "edge"` export
// below is what actually puts this route on Vercel's Edge Runtime — see
// https://vercel.com/docs/functions/runtimes/edge.
//
// Setup
// ─────
//   npm install @maildeno/renderer resend
//   Set RESEND_API_KEY in your Vercel project's Environment Variables
//   vercel deploy
//
// See ./README.md for the full walkthrough.

import { render, RenderError } from "@maildeno/renderer";
import { Resend } from "resend";
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
    // welcomeTemplate is already a parsed object — Next.js resolves the
    // JSON import at build time. The edge build of @maildeno/renderer only
    // accepts a parsed template, never a file path: there's no disk here to
    // read one from. See the main README's "Browsers and edge runtimes"
    // section for why.
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

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    // Must be a domain (or the resend.dev test address) you've verified
    // with Resend — see https://resend.com/docs/dashboard/domains/introduction.
    from: "Acme <onboarding@yourdomain.com>",
    to: [body.email],
    subject: `Welcome, ${body.firstName}!`,
    html,
  });

  if (error) {
    return Response.json(
      { error: "resend_error", message: error.message },
      { status: 502 },
    );
  }

  return Response.json({ sent: true, id: data?.id });
}
