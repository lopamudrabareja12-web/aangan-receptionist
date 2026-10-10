import type { Extraction } from "./extraction-schema";
import type { RubricResult } from "./rubric";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HEADLINE: Record<RubricResult["decision"], string> = {
  qualified: "New qualified enquiry",
  qualified_flagged: "New qualified enquiry (needs a look: see flags)",
  declined: "Declined: for review",
  deferred: "Deferred: revisit later",
  escalation: "ESCALATION: not a new enquiry",
  incomplete: "Incomplete call",
};

const FLAG_TEXT: Record<string, string> = {
  timeline_tight: "Timeline is tight (under the usual 8 weeks)",
  caller_on_behalf: "Caller is acting for the owner(s)",
  decision_maker_unconfirmed: "Decision-maker not confirmed",
  missing_carpet_area: "Carpet area not captured",
  missing_timeline: "Timeline not captured",
  location_unclear: "Location not clearly inside Pune/PCMC",
  small_commercial_below_typical: "Small commercial space (below the usual ~500 sq ft)",
  large_commercial_above_typical: "Large commercial space (above ~3,000 sq ft)",
  vip: "VIP referral (friend/associate of Nikhil)",
  price_asked: "Caller asked about price; the standard deflection was used and no number was given",
  complaint: "Existing-client complaint",
  follow_up_failure: "Earlier enquiry was not followed up",
};

export interface HandoffInput {
  extraction: Extraction | null;
  rubric: RubricResult;
  callerName: string | null;
  callerPhone: string | null;
  callStartedAt: Date;
  callId: string;
  consoleUrl?: string;
}

/** Deterministic handoff note. Identifiers are merged in HERE, after the AI step, never sent to Gemini. */
export function composeHandoffNote(i: HandoffInput): { text: string; html: string } {
  const x = i.extraction;
  const rows: [string, string | null][] = [
    ["Caller", [i.callerName ?? "Name not captured", i.callerPhone].filter(Boolean).join(" · ")],
    ["Location", x?.location ?? null],
    ["Property", x ? [x.property_type, x.carpet_area_sqft ? `${x.carpet_area_sqft.toLocaleString("en-IN")} sq ft carpet` : null].filter(Boolean).join(", ") || null : null],
    ["Scope", x?.scope_summary ?? null],
    ["Rooms", x?.rooms.length ? x.rooms.join(", ") : null],
    ["Furniture", x?.furniture_needed ?? null],
    ["Storage/wardrobe/kitchen", x?.storage_needs ?? null],
    ["Structural work", x && x.structural_work !== "unknown" ? x.structural_work : null],
    ["Property status", x?.property_status ?? null],
    ["Timeline", x?.timeline_text ?? null],
    ["Who decides", x ? [x.owner_status !== "unknown" ? x.owner_status.replace("_", " ") : null, x.decision_maker_confirmed === true ? "decision-maker confirmed" : x.decision_maker_confirmed === false ? "decision-maker NOT confirmed" : null].filter(Boolean).join(", ") || null : null],
    ["Budget (volunteered)", x?.budget_volunteered_inr ? `about Rs ${x.budget_volunteered_inr.toLocaleString("en-IN")}` : null],
    ["Heard about us via", x?.referral_source ?? null],
  ];
  const lines: string[] = [HEADLINE[i.rubric.decision]];
  if (i.rubric.detail) lines.push(i.rubric.detail);
  if (i.rubric.revisitOn) lines.push(`Revisit on: ${i.rubric.revisitOn}`);
  lines.push("");
  for (const [k, v] of rows) lines.push(`${k}: ${v ?? "(not captured)"}`);
  if (i.rubric.flags.length) {
    lines.push("", "Flags:");
    for (const f of i.rubric.flags) lines.push(`- ${FLAG_TEXT[f] ?? f}`);
  }
  if (x?.summary) lines.push("", `Summary: ${x.summary}`);
  const notAsked = i.rubric.missingFields.map((f) => f.replace(/_/g, " "));
  if (notAsked.length) lines.push("", `Not covered on the call: ${notAsked.join(", ")}`);
  lines.push("", `Call ${i.callId} at ${i.callStartedAt.toISOString()}${i.consoleUrl ? ` · transcript: ${i.consoleUrl}` : ""}`);

  const text = lines.join("\n");
  const html = lines.map((l) => (l === "" ? "<br>" : `<p>${esc(l)}</p>`)).join("");
  return { text, html };
}
