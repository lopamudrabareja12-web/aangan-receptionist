import type { Decision } from "@/lib/domain";
import type { HubSpotClient } from "@/lib/hubspot/client";
import { HubSpotError } from "@/lib/hubspot/client";
import { addNote, createTask, resolveStageIds, upsertContact, upsertDeal } from "@/lib/hubspot/crm";
import { buildDealProperties, stageForDecision, type DealInput } from "@/lib/hubspot/deal-mapping";
import { PIPELINE_LABEL } from "@/lib/hubspot/stages";
import { normalizePhone } from "@/lib/phone";
import { applyClaim, type ClaimPayload } from "./claim-deal";
import type { OutboxRow, PipelineStore } from "./store";

export interface SyncProgress {
  contactId?: string;
  dealId?: string;
  noteId?: string;
  taskIds?: string[];
}

export interface SyncPayload {
  callId: string;
  leadId: string;
  decision: Decision;
  callerPhone: string | null;
  callerName: string | null;
  deal: DealInput;
  noteHtml: string;
  tasks: { subject: string; body: string; dueAt: string }[];
  progress: SyncProgress;
}

/**
 * Writes one lead to HubSpot: contact, deal, note, tasks. Each step is skipped if its id is already in
 * `progress`, and progress is saved after every step, so a retry after a partial failure never duplicates.
 */
export async function syncLead(
  client: HubSpotClient,
  payload: SyncPayload,
  onProgress: (p: SyncProgress) => Promise<void>,
): Promise<SyncProgress> {
  const progress: SyncProgress = { ...payload.progress };
  const save = async () => onProgress({ ...progress });

  const phone = normalizePhone(payload.callerPhone);
  if (phone && !progress.contactId) {
    progress.contactId = (await upsertContact(client, { phone, name: payload.callerName })).id;
    await save();
  }
  if (!progress.dealId) {
    const { pipelineId, stageIds } = await resolveStageIds(client, PIPELINE_LABEL);
    const props = buildDealProperties(payload.deal, stageIds[stageForDecision(payload.decision)], pipelineId);
    progress.dealId = (await upsertDeal(client, { callId: payload.callId, properties: props, contactId: progress.contactId })).id;
    await save();
  }
  if (!progress.noteId) {
    progress.noteId = (await addNote(client, { dealId: progress.dealId, contactId: progress.contactId, body: payload.noteHtml })).id;
    await save();
  }
  const done = progress.taskIds ?? [];
  for (let i = done.length; i < payload.tasks.length; i++) {
    const t = payload.tasks[i];
    const created = await createTask(client, { dealId: progress.dealId, contactId: progress.contactId, subject: t.subject, body: t.body, dueAt: new Date(t.dueAt) });
    done.push(created.id);
    progress.taskIds = [...done];
    await save();
  }
  return progress;
}

export const MAX_ATTEMPTS = 8;
export const retryDelayMs = (attempts: number) => Math.min(6 * 3600_000, 60_000 * 2 ** attempts);

export interface RunSummary {
  processed: number;
  done: number;
  retried: number;
  dead: number;
}

/** Works through due outbox rows. A HubSpot outage just leaves rows pending with backoff, so no call is ever lost. */
export async function runOutbox(deps: { store: PipelineStore; client: HubSpotClient; now: Date; limit?: number }): Promise<RunSummary> {
  const { store, client, now } = deps;
  const rows = await store.claimDueOutbox(now, deps.limit ?? 20, 5 * 60_000);
  const out: RunSummary = { processed: rows.length, done: 0, retried: 0, dead: 0 };
  for (const row of rows) await processRow(row);
  return out;

  async function processRow(row: OutboxRow) {
    const payload = row.payload as SyncPayload | ClaimPayload;
    const leadId = payload.leadId;
    try {
      let detail: Record<string, unknown>;
      if (row.operation === "claim_deal") {
        const p = payload as ClaimPayload;
        await applyClaim(client, p, async (progress) => {
          p.progress = progress;
          await store.updateOutboxPayload(row.id, p);
        });
        detail = { dealId: p.dealId, ownerId: p.ownerId, via: p.via };
        await store.addEvent(leadId, "hubspot_owner_set", detail);
      } else {
        const p = payload as SyncPayload;
        const progress = await syncLead(client, p, async (pr) => {
          p.progress = pr;
          await store.updateOutboxPayload(row.id, p);
        });
        await store.setLeadHubspotIds(leadId, { contactId: progress.contactId ?? null, dealId: progress.dealId ?? null });
        detail = { dealId: progress.dealId };
        await store.addEvent(leadId, "hubspot_synced", detail);
      }
      await store.completeOutbox(row.id, now);
      await store.logSync({ outboxId: row.id, leadId, operation: row.operation, ok: true, detail });
      out.done++;
    } catch (e) {
      const status = e instanceof HubSpotError ? e.status : undefined;
      const permanent = e instanceof HubSpotError ? !e.retryable : false;
      const attempts = row.attempts + 1;
      const dead = permanent || attempts >= MAX_ATTEMPTS;
      const message = e instanceof Error ? e.message.slice(0, 400) : "unknown error";
      await store.failOutbox(row.id, message, dead ? null : new Date(now.getTime() + retryDelayMs(attempts)), now);
      await store.logSync({ outboxId: row.id, leadId, operation: row.operation, ok: false, httpStatus: status, detail: { error: message, dead } });
      if (dead) out.dead++;
      else out.retried++;
    }
  }
}
