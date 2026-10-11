import { timingSafeEqual } from "node:crypto";
import { HubSpotClient } from "@/lib/hubspot/client";
import { GeminiExtractor } from "@/lib/pipeline/extractor";
import { ResendMailer } from "@/lib/mail/resend";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { runTick } from "@/lib/pipeline/tick";
import { getSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

const authorised = (req: Request): boolean => {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
};

async function tick(request: Request): Promise<Response> {
  if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
  const e = process.env;
  const base = e.APP_BASE_URL;
  const claimSecret = e.CLAIM_LINK_SECRET;
  if (!base || !claimSecret) return Response.json({ error: "APP_BASE_URL and CLAIM_LINK_SECRET must be set" }, { status: 500 });
  const result = await runTick({
    store: new SupabaseStore(getSupabase()),
    now: new Date(),
    baseUrl: base,
    claimSecret,
    nikhilEmail: e.NIKHIL_EMAIL,
    extractor: e.GEMINI_API_KEY && e.GEMINI_MODEL ? GeminiExtractor.fromApiKey(e.GEMINI_API_KEY, e.GEMINI_MODEL) : undefined,
    hubspot: e.HUBSPOT_ACCESS_TOKEN ? new HubSpotClient({ token: e.HUBSPOT_ACCESS_TOKEN }) : undefined,
    mailer: e.RESEND_API_KEY && e.EMAIL_FROM ? new ResendMailer({ apiKey: e.RESEND_API_KEY, from: e.EMAIL_FROM }) : undefined,
  });
  return Response.json(result);
}

export const POST = tick;
export const GET = tick; // so a plain scheduler (or a browser with the header) can call it too
