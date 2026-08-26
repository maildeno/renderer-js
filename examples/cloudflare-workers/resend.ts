// examples/cloudflare-workers/resend.ts
//
// Send a personalized welcome email from a Cloudflare Worker, rendered by
// @maildeno/renderer and delivered by Resend.
//
// Resend's Node SDK works natively in Cloudflare Workers — no fetch()
// workaround needed. Resend publishes an official Workers example that uses
// the same `resend.emails.send()` call as any other environment:
// https://github.com/resend/resend-cloudflare-workers-example
// https://resend.com/docs/send-with-cloudflare-workers
//
// Setup
// ─────
//   npm install @maildeno/renderer resend
//   wrangler secret put RESEND_API_KEY
//   wrangler deploy
//
// See ./README.md for the full walkthrough.

import { render, RenderError } from "@maildeno/renderer";
import { Resend } from "resend";
import welcomeTemplate from "./templates/welcome.json";

interface Env {
  RESEND_API_KEY: string;
}

interface SendRequest {
  email: string;
  firstName: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

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
      // welcomeTemplate is already a parsed object — Wrangler resolves the
      // JSON import at build time and bundles it straight into the Worker.
      // The edge build of @maildeno/renderer only accepts a parsed template,
      // never a file path: there's no disk here to read one from. See the
      // main README's "Browsers and edge runtimes" section for why.
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

    const resend = new Resend(env.RESEND_API_KEY);
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
  },
};
