import { requireEnv } from "@/lib/env";
import { GeminiExtractor } from "@/lib/pipeline/extractor";
import { processCall } from "@/lib/pipeline/process-call";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { handleVaaniWebhook } from "@/lib/pipeline/webhook-handler";
import { getSupabase } from "@/lib/supabase/server";

export const maxDuration = 60; // extraction takes a few seconds

export async function POST(request: Request): Promise<Response> {
  const { VAANI_WEBHOOK_SECRET } = requireEnv("VAANI_WEBHOOK_SECRET");
  return handleVaaniWebhook(request, {
    secret: VAANI_WEBHOOK_SECRET,
    // Clients are built only after the signature has been verified, so an unsigned request costs nothing.
    process: (call, opts) => {
      const env = requireEnv("GEMINI_API_KEY", "GEMINI_MODEL", "APP_BASE_URL");
      return processCall(
        { store: new SupabaseStore(getSupabase()), extractor: GeminiExtractor.fromApiKey(env.GEMINI_API_KEY, env.GEMINI_MODEL), consoleBaseUrl: env.APP_BASE_URL },
        call,
        opts,
      );
    },
  });
}
