import { ExtractionSchema } from "@/lib/pipeline/extraction-schema";
import { composeHandoffNote } from "@/lib/pipeline/handoff";
import type { ReinstatePayload } from "@/lib/pipeline/reinstate-deal";
import type { RubricResult } from "@/lib/pipeline/rubric";
import type { PipelineStore } from "@/lib/pipeline/store";
import { nextWorkingStart } from "@/lib/time";

export type ReinstateResult =
  | { status: "reinstated" }
  | { status: "not_found" }
  | { status: "not_declined" } // already reinstated, or never a decline
  | { status: "not_synced" }; // the HubSpot deal does not exist yet: try again in a minute

/**
 * Nikhil overrides a decline: the lead goes back to the designers. We (1) flip the decision once and atomically,
 * (2) queue the HubSpot stage move, and (3) open a claim so designers are emailed like any other qualified lead.
 * A declined lead only has a HubSpot deal after its first sync, so we wait for that rather than invent one.
 */
export async function reinstateLead(
  deps: { store: PipelineStore; now: Date; avgProjectValueInr: number; baseUrl?: string },
  leadId: string,
): Promise<ReinstateResult> {
  const { store, now } = deps;
  const lead = await store.getLeadForReinstate(leadId);
  if (!lead) return { status: "not_found" };
  if (lead.decision !== "declined" || lead.supersededByCallId) return { status: "not_declined" };
  if (!lead.hubspotDealId) return { status: "not_synced" };

  const flags = [...new Set([...lead.flags, "reinstated"])];
  if (!(await store.markReinstated(leadId, flags))) return { status: "not_declined" };
  await store.addEvent(leadId, "reinstated", { by: "console", previousDecision: "declined" });

  const parsed = ExtractionSchema.safeParse(lead.extraction);
  const extraction = parsed.success ? parsed.data : null;
  const rubric: RubricResult = { decision: "qualified_flagged", reasonCode: null, detail: "Reinstated by Nikhil after review of an automatic decline.", flags, missingFields: [], revisitOn: null };
  const note = composeHandoffNote({
    extraction, rubric, callerName: lead.name, callerPhone: lead.phone, callStartedAt: lead.startedAt, callId: lead.callId,
    consoleUrl: deps.baseUrl ? `${deps.baseUrl}/console/calls/${lead.callId}` : undefined,
  });
  const payload: ReinstatePayload = { leadId, dealId: lead.hubspotDealId, estimatedAmountInr: deps.avgProjectValueInr, progress: {} };
  await store.enqueueOutbox({ idempotencyKey: `reinstate_deal:${leadId}`, operation: "reinstate_deal", leadId, payload, runAfter: now });

  const who = [lead.name ?? "Unknown caller", extraction?.property_type, extraction?.location].filter(Boolean).join(" · ");
  await store.createAssignment({
    leadId, kind: "claim", notifyAt: nextWorkingStart(now), subject: `New enquiry (reinstated after review): ${who}`,
    noteText: note.text, noteHtml: note.html, isVip: flags.includes("vip"),
  });
  return { status: "reinstated" };
}
