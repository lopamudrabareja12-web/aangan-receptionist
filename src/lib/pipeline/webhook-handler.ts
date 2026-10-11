import { parseVaaniPayload, PayloadError, type NormalizedCall } from "@/lib/vaani/adapter";
import { SIGNATURE_HEADER, verifySignature } from "@/lib/vaani/signature";

export interface Accepted {
  callId: string;
  duplicate: boolean;
  /** The slow part (AI, rules, queueing). Runs AFTER the reply, so Vaani's 5-second limit is never at risk. */
  process: () => Promise<unknown>;
}

export interface WebhookDeps {
  secret: string;
  /** Stores the call (one fast write). If this throws, we answer 500 and Vaani retries. */
  accept: (call: NormalizedCall, opts: { rawPayload: unknown }) => Promise<Accepted>;
  /** Runs work after the response (Next's after()). Failures are caught: a stored-but-unprocessed call is swept up later. */
  schedule: (work: () => Promise<unknown>) => void;
}

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * POST handler logic for Vaani's end-of-call webhook. Verify, parse, store, reply 200, then process in the background.
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
  let accepted: Accepted;
  try {
    accepted = await deps.accept(call, { rawPayload: body });
  } catch (e) {
    console.error("[vaani-webhook] could not store the call:", e instanceof Error ? e.name : "unknown");
    return json({ error: "could not store the call, please retry" }, 500);
  }
  if (accepted.duplicate) return json({ status: "duplicate", callId: accepted.callId }, 200);
  deps.schedule(async () => {
    try {
      await accepted.process();
    } catch (e) {
      console.error("[vaani-webhook] processing failed (will be retried by the sweeper):", e instanceof Error ? e.name : "unknown");
    }
  });
  return json({ status: "accepted", callId: accepted.callId }, 200);
}
