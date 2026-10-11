import { z } from "zod";

// Maps Vaani's webhook events to our internal shapes. Built from Vaani's real "Test Connectivity" payload and docs
// (captured 11 Oct 2026). Each event is  { event, timestamp, data: {...} }  with  x-webhook-event  and  x-webhook-signature  headers.
// Only call_started (caller number, start time) and call_postprocessing (transcript) matter to us; the rest are acknowledged.
// STILL TO CONFIRM with a real call: the transcript line format and whether call_duration is seconds or milliseconds.

export interface NormalizedCall {
  vaaniCallId: string;
  callerNumber: string | null;
  startedAt: Date;
  durationSec: number | null;
  language: string | null;
  callerName: string | null; // only if Vaani extracted one
  transcript: string;        // "Agent: ...\nCaller: ..." lines
}

export interface CallMeta {
  callId: string;
  roomName: string | null;
  phoneNumber: string | null;
  callType: string | null;
  agentName: string | null;
  startedAt: Date | null;
}

export interface ParsedCall {
  vaaniCallId: string;
  roomName: string | null;
  durationSec: number | null;
  eventAt: Date;
  transcript: string;
  callerName: string | null;
}

export type VaaniEvent =
  | { kind: "test" }
  | { kind: "ignored"; event: string }
  | { kind: "call_started"; meta: CallMeta }
  | { kind: "call"; call: ParsedCall };

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadError";
  }
}

const date = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a valid date");
const envelope = z.object({
  event: z.string().optional(),
  call_id: z.string().optional(),
  timestamp: date.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Vaani documents call_duration as seconds on call_ended and milliseconds on call_postprocessing; their test sends seconds.
 *  No real call is ever longer than 10,000 seconds (2.8 hours), so a bigger number is milliseconds. */
export function durationToSeconds(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  // whole seconds: the database column is an integer, and Vaani sends decimals such as 65.152
  return Math.round(v > 10_000 ? v / 1000 : v);
}

const TS_PREFIX = /^\s*[[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?[\])]?\s*[-–:]?\s*/;
const AGENT = /^(agent|ai|assistant|bot)\s*:\s*/i;
const CALLER = /^(user|caller|customer|human|client)\s*:\s*/i;

/** "Agent: …" / "User: …" (optionally timestamped) -> "Agent: …" / "Caller: …"; wrapped lines are joined to the previous turn. */
export function normalizeTranscript(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => {
        const o = t as { speaker?: unknown; role?: unknown; text?: unknown };
        const who = String(o.speaker ?? o.role ?? "");
        return `${AGENT.test(`${who}:`) ? "Agent" : "Caller"}: ${String(o.text ?? "")}`;
      })
      .join("\n");
  }
  if (typeof raw !== "string") return "";
  const lines: string[] = [];
  for (const original of raw.split(/\r?\n/)) {
    const line = original.replace(TS_PREFIX, (m) => (AGENT.test(original.slice(m.length)) || CALLER.test(original.slice(m.length)) ? "" : m));
    if (AGENT.test(line)) lines.push(`Agent: ${line.replace(AGENT, "").trim()}`);
    else if (CALLER.test(line)) lines.push(`Caller: ${line.replace(CALLER, "").trim()}`);
    else if (line.trim() && lines.length) lines[lines.length - 1] += ` ${line.trim()}`;
  }
  return lines.join("\n");
}

export function parseVaaniEvent(raw: unknown, eventHeader?: string | null): VaaniEvent {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) throw new PayloadError(`Unrecognised webhook payload: ${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")}`);
  const body = parsed.data;
  const event = body.event ?? eventHeader ?? "";
  const data = body.data ?? {};

  if (event === "webhook_test") return { kind: "test" };

  if (event === "call_started") {
    const callId = str(data.call_id) ?? str(data.room_name);
    if (!callId) throw new PayloadError("call_started has no call id");
    return {
      kind: "call_started",
      meta: { callId, roomName: str(data.room_name), phoneNumber: str(data.phone_number), callType: str(data.call_type), agentName: str(data.agent_name), startedAt: body.timestamp ? new Date(body.timestamp) : null },
    };
  }

  if (event === "call_postprocessing") {
    const callId = str(data.call_id) ?? body.call_id ?? str(data.room_name);
    if (!callId) throw new PayloadError("call_postprocessing has no call id");
    const entities = (data.entities ?? {}) as Record<string, unknown>;
    return {
      kind: "call",
      call: {
        vaaniCallId: callId, roomName: str(data.room_name), durationSec: durationToSeconds(data.call_duration),
        eventAt: body.timestamp ? new Date(body.timestamp) : new Date(), transcript: normalizeTranscript(data.transcript),
        callerName: str(entities.customer_name) ?? str(entities.name) ?? str(entities.caller_name),
      },
    };
  }
  return { kind: "ignored", event: event || "(no event name)" };
}

/** Joins the post-call event with what call_started told us. Without it, the number is unknown and the start time is estimated. */
export function toNormalizedCall(c: ParsedCall, meta: CallMeta | null): NormalizedCall {
  const startedAt = meta?.startedAt ?? new Date(c.eventAt.getTime() - (c.durationSec ?? 0) * 1000);
  return { vaaniCallId: c.vaaniCallId, callerNumber: meta?.phoneNumber ?? null, startedAt, durationSec: c.durationSec, language: null, callerName: c.callerName, transcript: c.transcript };
}
