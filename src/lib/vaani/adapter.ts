import { z } from "zod";

// ASSUMPTION, NOT FACT: Vaani's real webhook payload has not been seen yet. This adapter maps OUR invented fixture
// (fixtures/vaani/FAKE-sample-call.json) to the internal NormalizedCall. When a real sample arrives, only this file
// and its test change; nothing downstream knows Vaani's format.

export interface NormalizedCall {
  vaaniCallId: string;
  callerNumber: string | null;
  startedAt: Date;
  durationSec: number | null;
  language: string | null;
  callerName: string | null; // only if the platform supplies it
  transcript: string;        // "Agent: ...\nCaller: ..." lines
}

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadError";
  }
}

const turn = z.object({ speaker: z.string(), text: z.string() });
const payload = z.object({
  call_id: z.string().min(1),
  from_number: z.string().nullable().optional(),
  started_at: z.string(),
  duration_seconds: z.number().nullable().optional(),
  language: z.string().nullable().optional(),
  caller_name: z.string().nullable().optional(),
  transcript: z.union([z.string(), z.array(turn)]).nullable().optional(),
});

const label = (speaker: string) => (/^(agent|assistant|bot|front.?desk)/i.test(speaker) ? "Agent" : "Caller");

export function parseVaaniPayload(raw: unknown): NormalizedCall {
  const parsed = payload.safeParse(raw);
  if (!parsed.success) {
    throw new PayloadError(`Unrecognised call payload: ${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")}`);
  }
  const p = parsed.data;
  const startedAt = new Date(p.started_at);
  if (Number.isNaN(startedAt.getTime())) throw new PayloadError("started_at is not a valid date");
  const t = p.transcript;
  const transcript = !t ? "" : typeof t === "string" ? t : t.map((x) => `${label(x.speaker)}: ${x.text}`).join("\n");
  return {
    vaaniCallId: p.call_id,
    callerNumber: p.from_number ?? null,
    startedAt,
    durationSec: p.duration_seconds ?? null,
    language: p.language ?? null,
    callerName: p.caller_name ?? null,
    transcript,
  };
}
