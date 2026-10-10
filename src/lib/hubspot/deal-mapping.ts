import type { Decision } from "@/lib/domain";
import type { StageKey } from "./stages";

export const ESTIMATE_NOTICE =
  "Amount is an ESTIMATE (the studio's average project value), not a quote. The designer replaces it with the real quote.";

/** Which pipeline stage a fresh lead lands in, by rubric decision. */
export function stageForDecision(decision: Decision): StageKey {
  switch (decision) {
    case "qualified":
    case "qualified_flagged":
      return "new_qualified";
    case "declined":
      return "declined_review";
    case "deferred":
      return "deferred";
    case "escalation":
      return "escalation";
    case "incomplete":
      return "incomplete_call";
  }
}

/** Only qualified leads get the estimated amount, so HubSpot's pipeline-value report is not inflated by declines. */
export function estimatedAmount(decision: Decision, avgProjectValueInr: number): number | undefined {
  return decision === "qualified" || decision === "qualified_flagged" ? avgProjectValueInr : undefined;
}

export interface DealInput {
  callId: string;
  decision: Decision;
  name?: string | null;
  location?: string | null;
  propertyType?: string | null;
  carpetAreaSqft?: number | null;
  readyByDate?: string | null; // YYYY-MM-DD
  referralSource?: string | null;
  isVip: boolean;
  flags: string[];
  declineDetail?: string | null;
  avgProjectValueInr: number;
}

/** HubSpot deal properties for a new lead. Empty values are omitted so nothing blank overwrites designer edits later. */
export function buildDealProperties(input: DealInput, stageId: string, pipelineId: string): Record<string, string | number> {
  const amount = estimatedAmount(input.decision, input.avgProjectValueInr);
  const title = [input.name ?? "Unknown caller", input.propertyType, input.location].filter(Boolean).join(" · ");
  const description = [
    amount !== undefined ? ESTIMATE_NOTICE : null,
    input.flags.length ? `Flags: ${input.flags.join(", ")}` : null,
    input.declineDetail ? `Reason: ${input.declineDetail}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const props: Record<string, string | number | undefined> = {
    dealname: title,
    pipeline: pipelineId,
    dealstage: stageId,
    amount,
    description: description || undefined,
    hs_priority: input.isVip ? "HIGH" : undefined,
    aangan_call_id: input.callId,
    aangan_carpet_area_sqft: input.carpetAreaSqft ?? undefined,
    aangan_property_type: input.propertyType ?? undefined,
    aangan_ready_by: input.readyByDate ?? undefined,
    aangan_referral_source: input.referralSource ?? undefined,
  };
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string | number>;
}
