import { parseVaaniEvent, PayloadError, type CallMeta, type ParsedCall } from "@/lib/vaani/adapter";
import { EVENT_HEADER, SIGNATURE_HEADER, verifySignature } from "@/lib/vaani/signature";

export interface Accepted {
  callId: string;
  duplicate: boolean;
  /** The slow part (AI, rules, queueing). Runs AFTER the reply, so Vaani's 5-second limit is never at risk. */
  process: () => Promise<unknown>;
}

export interface WebhookDeps {
  secret: string;
  /** Remember the caller's number and start time from Vaani's call_started event. */
  onCallStarted: (meta: CallMeta) => Promise<void>;
  /** Stores the finished call (one fast write). If this throws, we answer 500 and Vaani retries. */
  accept: (call: ParsedCall, opts: { rawPayload: unknown }) => Promise<Accepted>;
  /** Runs work after the response (Next's after()). Failures are caught: a stored-but-unprocessed call is swept up later. */
  schedule: (work: () => Promise<unknown>) => void;
}

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * POST handler logic for Vaani's webhooks. Verify, then by event: acknowledge tests and irrelevant events, remember
 * call_started, and for call_postprocessing store the call, reply 200, and process in the background.
 * Responses never echo the payload, the secret or internal error text.
 */
export async function handleVaaniWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const raw = await req.text(); // the signature covers the exact raw bytes, so read the body once as text
  if (!verifySignature(raw, req.headers.get(SIGNATURE_HEADER), deps.secret)) {
    // Diagnostic (no secrets): why was it rejected? "placeholder" = signed with the throwaway word we used while capturing samples.
    const header = req.headers.get(SIGNATURE_HEADER);
    console.warn("[vaani-webhook] signature rejected", JSON.stringify({
      event: req.headers.get(EVENT_HEADER), hasSignature: !!header, bytes: raw.length,
      signedWithPlaceholderSecret: verifySignature(raw, header, "capture-test-secret"),
    }));
    return json({ error: "invalid signature" }, 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "body is not valid JSON" }, 400);
  }
  let event;
  try {
    event = parseVaaniEvent(body, req.headers.get(EVENT_HEADER));
  } catch (e) {
    if (e instanceof PayloadError) return json({ error: e.message }, 400);
    throw e;
  }

  if (event.kind === "test") return json({ status: "test_ok" }, 200);
  if (event.kind === "ignored") return json({ status: "ignored", event: event.event }, 200);

  if (event.kind === "call_started") {
    try {
      await deps.onCallStarted(event.meta);
    } catch (e) {
      console.error("[vaani-webhook] could not save call_started:", e instanceof Error ? e.name : "unknown");
      return json({ error: "could not save, please retry" }, 500);
    }
    return json({ status: "noted" }, 200);
  }

  let accepted: Accepted;
  try {
    accepted = await deps.accept(event.call, { rawPayload: body });
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
