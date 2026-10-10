import { parseVaaniPayload, PayloadError, type NormalizedCall } from "@/lib/vaani/adapter";
import { SIGNATURE_HEADER, verifySignature } from "@/lib/vaani/signature";
import type { ProcessOutcome } from "./process-call";

export interface WebhookDeps {
  secret: string;
  process: (call: NormalizedCall, opts: { rawPayload: unknown }) => Promise<ProcessOutcome>;
}

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * POST handler logic for Vaani's end-of-call webhook. Kept separate from the Next route so it can be tested directly.
 * Responses never echo the payload, the secret or internal error text.
 */
export async function handleVaaniWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const raw = await req.text(); // the signature covers the exact raw bytes, so read the body once as text
  if (!verifySignature(raw, req.headers.get(SIGNATURE_HEADER), deps.secret)) {
    return json({ error: "invalid signature" }, 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "body is not valid JSON" }, 400);
  }
  let call: NormalizedCall;
  try {
    call = parseVaaniPayload(body);
  } catch (e) {
    if (e instanceof PayloadError) return json({ error: e.message }, 400);
    throw e;
  }
  try {
    const out = await deps.process(call, { rawPayload: body });
    return json(out.status === "duplicate" ? { status: "duplicate", callId: out.callId } : { status: "processed", callId: out.callId, decision: out.decision }, 200);
  } catch (e) {
    console.error("[vaani-webhook] processing failed:", e instanceof Error ? e.name : "unknown");
    // 500 so Vaani retries; the pipeline is idempotent on the call id, and a failed call is reprocessed.
    return json({ error: "processing failed, please retry" }, 500);
  }
}
