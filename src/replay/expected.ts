import type { Decision } from "@/lib/domain";
import type { ReasonCode } from "@/lib/pipeline/rubric";

// Intended outcomes for the Replay Lab (human desk decision -> our system's intended decision), from the build brief.
export interface Expected {
  /** "qualified_any" = forwarded to a designer, with or without flags. */
  decision: Decision | "qualified_any";
  reason?: ReasonCode;
  flags?: string[];
  /** the lead must carry a revisit date; a string means it must start with it (e.g. "2026-11") */
  revisit?: true | string;
  note: string;
}

export const EXPECTED: Record<string, Expected> = {
  T01: { decision: "qualified_any", note: "qualify" },
  T02: { decision: "qualified_any", flags: ["price_asked"], note: "qualify, price deflected" },
  T03: { decision: "declined", reason: "out_of_area", note: "decline: out of area" },
  T04: { decision: "declined", reason: "advice_only", revisit: true, note: "decline: advice only, revisit note" },
  T05: { decision: "qualified_any", flags: ["vip"], note: "qualify, VIP" },
  T06: { decision: "qualified_any", note: "qualify (commercial, 800 sq ft)" },
  T07: { decision: "deferred", reason: "timeline_too_short", revisit: "2026-11", note: "deferred, revisit for a November start" },
  T08: { decision: "incomplete", reason: "incomplete_call", note: "incomplete, callback task" },
  T09: { decision: "escalation", reason: "existing_client_complaint", note: "escalation: existing client complaint" },
  T10: { decision: "declined", reason: "budget_too_low", note: "declined: volunteered budget far below scope" },
  T11: { decision: "qualified_any", note: "qualify (rented, no structural)" },
  T12: { decision: "qualified_any", note: "qualify (large villa)" },
  T13: { decision: "qualified_any", flags: ["price_asked"], note: "qualify, price deflected" },
  T14: { decision: "qualified_flagged", flags: ["caller_on_behalf"], note: "qualify with flag: caller is the son" },
  T15: { decision: "qualified_any", note: "qualify (six weeks to possession)" },
  T16: { decision: "escalation", reason: "follow_up_failure", note: "escalation: earlier lead lost" },
  T17: { decision: "qualified_any", note: "qualify; the dropped first call is superseded (dedupe)" },
  T18: { decision: "qualified_flagged", flags: ["small_commercial_below_typical"], note: "forward with flag (180 sq ft commercial)" },
  T19: { decision: "declined", reason: "out_of_scope_type", note: "decline: restaurant is out of scope" },
  T20: { decision: "qualified_any", note: "qualify" },
};
