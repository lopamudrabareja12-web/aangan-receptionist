import type { HubSpotClient } from "@/lib/hubspot/client";
import { addNote, getDealStage, moveDealStage, resolveStageIds, setDealOwner } from "@/lib/hubspot/crm";
import { PIPELINE_LABEL } from "@/lib/hubspot/stages";

export interface ClaimProgress {
  ownerSet?: boolean;
  stageHandled?: boolean;
  noteId?: string;
}

export interface ClaimPayload {
  leadId: string;
  dealId: string;
  ownerId: string;
  designerName: string;
  via: "claim" | "auto";
  progress: ClaimProgress;
}

/**
 * Writes a claim into HubSpot: set the deal owner, move New -> Claimed, leave a note. Each step is skipped once done,
 * so a retry never repeats it. The stage only moves if the deal is still in "New": if a designer already moved it on,
 * we never drag it backwards.
 */
export async function applyClaim(client: HubSpotClient, payload: ClaimPayload, onProgress: (p: ClaimProgress) => Promise<void>): Promise<ClaimProgress> {
  const progress: ClaimProgress = { ...payload.progress };
  if (!progress.ownerSet) {
    await setDealOwner(client, payload.dealId, payload.ownerId);
    progress.ownerSet = true;
    await onProgress({ ...progress });
  }
  if (!progress.stageHandled) {
    const { stageIds } = await resolveStageIds(client, PIPELINE_LABEL);
    if ((await getDealStage(client, payload.dealId)) === stageIds.new_qualified) await moveDealStage(client, payload.dealId, stageIds.claimed);
    progress.stageHandled = true;
    await onProgress({ ...progress });
  }
  if (!progress.noteId) {
    const how = payload.via === "auto" ? "auto-assigned after nobody claimed it in time" : "claimed through the emailed link";
    progress.noteId = (await addNote(client, { dealId: payload.dealId, body: `<p>${payload.designerName.replace(/</g, "&lt;")} owns this lead: ${how}.</p>` })).id;
    await onProgress({ ...progress });
  }
  return progress;
}
