import type { HubSpotClient } from "@/lib/hubspot/client";
import { addNote, moveDealStage, resolveStageIds, updateDealProperties } from "@/lib/hubspot/crm";
import { ESTIMATE_NOTICE } from "@/lib/hubspot/deal-mapping";
import { PIPELINE_LABEL } from "@/lib/hubspot/stages";

export interface ReinstateProgress {
  stageMoved?: boolean;
  noteId?: string;
}

export interface ReinstatePayload {
  leadId: string;
  dealId: string;
  estimatedAmountInr: number;
  progress: ReinstateProgress;
}

/**
 * Moves a deal that was declined for review back to "New (qualified)" after Nikhil reinstated it, sets the estimated amount
 * (qualified leads only carry one) and leaves a note. Each step is skipped once done, so a retry never repeats it.
 */
export async function applyReinstate(client: HubSpotClient, payload: ReinstatePayload, onProgress: (p: ReinstateProgress) => Promise<void>): Promise<ReinstateProgress> {
  const progress: ReinstateProgress = { ...payload.progress };
  if (!progress.stageMoved) {
    const { stageIds } = await resolveStageIds(client, PIPELINE_LABEL);
    await moveDealStage(client, payload.dealId, stageIds.new_qualified);
    await updateDealProperties(client, payload.dealId, { amount: payload.estimatedAmountInr, description: ESTIMATE_NOTICE });
    progress.stageMoved = true;
    await onProgress({ ...progress });
  }
  if (!progress.noteId) {
    progress.noteId = (await addNote(client, { dealId: payload.dealId, body: "<p>Reinstated after review: this enquiry was first declined by the system and Nikhil put it back with the designers.</p>" })).id;
    await onProgress({ ...progress });
  }
  return progress;
}
