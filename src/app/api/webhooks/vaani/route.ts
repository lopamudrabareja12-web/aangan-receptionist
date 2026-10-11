import { after } from "next/server";
import { requireEnv } from "@/lib/env";
import { GeminiExtractor } from "@/lib/pipeline/extractor";
import { processReceived, receiveCall } from "@/lib/pipeline/process-call";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { handleVaaniWebhook } from "@/lib/pipeline/webhook-handler";
import { getSupabase } from "@/lib/supabase/server";

export const maxDuration = 60; // the background processing (AI call) may take a few seconds after the reply

export async function POST(request: Request): Promise<Response> {
  const { VAANI_WEBHOOK_SECRET } = requireEnv("VAANI_WEBHOOK_SECRET");
  return handleVaaniWebhook(request, {
    secret: VAANI_WEBHOOK_SECRET,
    schedule: (work) => after(work),
    // Clients are built only after the signature has been verified, so an unsigned request costs nothing.
    accept: async (call, opts) => {
      const env = requireEnv("GEMINI_API_KEY", "GEMINI_MODEL", "APP_BASE_URL");
      const deps = { store: new SupabaseStore(getSupabase()), extractor: GeminiExtractor.fromApiKey(env.GEMINI_API_KEY, env.GEMINI_MODEL), consoleBaseUrl: env.APP_BASE_URL };
      const received = await receiveCall(deps.store, call, opts);
      return { callId: received.call.id, duplicate: received.duplicate, process: () => processReceived(deps, received.call, call) };
    },
  });
}
