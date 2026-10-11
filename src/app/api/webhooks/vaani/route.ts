import { after } from "next/server";
import { requireEnv } from "@/lib/env";
import { GeminiExtractor } from "@/lib/pipeline/extractor";
import { processReceived, receiveCall } from "@/lib/pipeline/process-call";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { handleVaaniWebhook } from "@/lib/pipeline/webhook-handler";
import { getSupabase } from "@/lib/supabase/server";
import { toNormalizedCall } from "@/lib/vaani/adapter";

export const maxDuration = 60; // the background processing (AI call) may take a few seconds after the reply

export async function POST(request: Request): Promise<Response> {
  const { VAANI_WEBHOOK_SECRET } = requireEnv("VAANI_WEBHOOK_SECRET");
  return handleVaaniWebhook(request, {
    secret: VAANI_WEBHOOK_SECRET,
    schedule: (work) => after(work),
    // Clients are built only after the signature has been verified, so an unsigned request costs nothing.
    onCallStarted: (meta) => new SupabaseStore(getSupabase()).saveCallMeta(meta),
    accept: async (parsed, opts) => {
      const env = requireEnv("GEMINI_API_KEY", "GEMINI_MODEL", "APP_BASE_URL");
      const store = new SupabaseStore(getSupabase());
      const meta = await store.getCallMeta([parsed.vaaniCallId, parsed.roomName ?? ""]);
      const call = toNormalizedCall(parsed, meta);
      const deps = { store, extractor: GeminiExtractor.fromApiKey(env.GEMINI_API_KEY, env.GEMINI_MODEL), consoleBaseUrl: env.APP_BASE_URL };
      const received = await receiveCall(store, call, opts);
      return { callId: received.call.id, duplicate: received.duplicate, process: () => processReceived(deps, received.call, call) };
    },
  });
}
