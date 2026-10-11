import { verifyClaimToken } from "@/lib/claim-token";
import type { ClaimPayload } from "./claim-deal";
import type { Assignment, Designer, PipelineStore } from "./store";

/** Queues the HubSpot write for a claim (owner, stage, note). Same key per lead, so it is never queued twice. */
export async function enqueueClaim(store: PipelineStore, a: Assignment, designer: Designer, via: "claim" | "auto", now: Date): Promise<void> {
  if (!a.hubspotDealId || !designer.hubspotOwnerId) throw new Error("claim needs a HubSpot deal and a designer linked to a HubSpot owner");
  const payload: ClaimPayload = { leadId: a.leadId, dealId: a.hubspotDealId, ownerId: designer.hubspotOwnerId, designerName: designer.name, via, progress: {} };
  await store.enqueueOutbox({ idempotencyKey: `claim_deal:${a.leadId}`, operation: "claim_deal", leadId: a.leadId, payload, runAfter: now });
  await store.addEvent(a.leadId, via === "auto" ? "auto_assigned" : "claimed", { designerId: designer.id, designer: designer.name });
}

export type ClaimResult =
  | { status: "claimed"; designerName: string }
  | { status: "already_yours"; designerName: string }
  | { status: "taken"; byName: string }
  | { status: "invalid" }
  | { status: "not_found" }
  | { status: "not_ready" };

/** Who may see/claim a lead through a link. Returns the designer when the link is genuine. */
export async function resolveLink(store: PipelineStore, secret: string, leadId: string, designerId: string, token: string | null | undefined) {
  if (!verifyClaimToken(secret, leadId, designerId, token)) return { ok: false as const, status: "invalid" as const };
  const [assignment, designers] = await Promise.all([store.getAssignment(leadId), store.listDesigners()]);
  const designer = designers.find((d) => d.id === designerId);
  if (!assignment || assignment.kind !== "claim") return { ok: false as const, status: "not_found" as const };
  if (!designer) return { ok: false as const, status: "invalid" as const };
  return { ok: true as const, assignment, designer, designers };
}

/** First valid claim wins. The database update is atomic, so two designers pressing at once cannot both succeed. */
export async function claimByLink(deps: { store: PipelineStore; secret: string; now: Date }, leadId: string, designerId: string, token: string | null | undefined): Promise<ClaimResult> {
  const r = await resolveLink(deps.store, deps.secret, leadId, designerId, token);
  if (!r.ok) return { status: r.status };
  const { assignment, designer, designers } = r;
  if (assignment.status === "claimed" || assignment.status === "auto_assigned") {
    if (assignment.designerId === designer.id) {
      // heal: if the first attempt claimed but failed to queue the HubSpot write, queueing again is safe (same key)
      if (assignment.hubspotDealId && designer.hubspotOwnerId) await enqueueClaim(deps.store, assignment, designer, assignment.via ?? "claim", deps.now);
      return { status: "already_yours", designerName: designer.name };
    }
    return { status: "taken", byName: designers.find((d) => d.id === assignment.designerId)?.name ?? "another designer" };
  }
  if (!assignment.hubspotDealId || !designer.hubspotOwnerId) return { status: "not_ready" };
  const won = await deps.store.claimLead(leadId, designer.id, "claim", deps.now);
  if (!won) {
    const latest = await deps.store.getAssignment(leadId);
    return { status: "taken", byName: designers.find((d) => d.id === latest?.designerId)?.name ?? "another designer" };
  }
  await enqueueClaim(deps.store, assignment, designer, "claim", deps.now);
  return { status: "claimed", designerName: designer.name };
}
