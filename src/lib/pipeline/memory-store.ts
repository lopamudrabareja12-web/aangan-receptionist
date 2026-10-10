import { randomUUID } from "node:crypto";
import type { CallCost } from "./costs";
import { DEFAULT_RATES } from "./costs";
import type { CallRecord, LeadRecord, NewLead, OutboxRow, PipelineStore, RecentCall, Settings } from "./store";

/** In-memory PipelineStore for tests and the Replay Lab. Nothing here touches Supabase or HubSpot. */
export class MemoryStore implements PipelineStore {
  calls = new Map<string, CallRecord>();
  leads = new Map<string, LeadRecord & { raw: NewLead; cost: CallCost }>();
  events: { leadId: string; eventType: string; detail?: unknown }[] = [];
  outbox = new Map<string, OutboxRow>();
  syncLog: { outboxId: string | null; leadId: string | null; operation: string; ok: boolean; httpStatus?: number; detail?: unknown }[] = [];
  callErrors = new Map<string, string>();

  constructor(private settings: Settings = { ...DEFAULT_RATES, avg_project_value_inr: 1_100_000 }) {}

  async getSettings() {
    return this.settings;
  }

  async insertCall(c: Omit<CallRecord, "id" | "status">) {
    const existing = [...this.calls.values()].find((x) => x.vaaniCallId === c.vaaniCallId);
    if (existing) return { call: existing, created: false };
    const call: CallRecord = { ...c, id: randomUUID(), status: "received" };
    this.calls.set(call.id, call);
    return { call, created: true };
  }

  async setCallStatus(callId: string, status: CallRecord["status"], error?: string) {
    const c = this.calls.get(callId);
    if (c) c.status = status;
    if (error) this.callErrors.set(callId, error);
  }

  async recentCallsFromNumber(number: string, since: Date, excludeCallId: string): Promise<RecentCall[]> {
    return [...this.calls.values()]
      .filter((c) => c.callerNumber === number && c.id !== excludeCallId && c.startedAt >= since)
      .map((c) => {
        const lead = [...this.leads.values()].find((l) => l.callId === c.id);
        return { callId: c.id, startedAt: c.startedAt, leadId: lead?.id ?? null, decision: lead?.decision ?? null, supersededByCallId: lead?.supersededByCallId ?? null };
      });
  }

  async saveLead(lead: NewLead, cost: CallCost) {
    const rec: LeadRecord = {
      id: randomUUID(), callId: lead.callId, name: lead.name, phone: lead.phone, decision: lead.rubric.decision,
      reasonCode: lead.rubric.reasonCode, flags: lead.rubric.flags, supersededByCallId: null, hubspotContactId: null, hubspotDealId: null,
    };
    this.leads.set(rec.id, { ...rec, raw: lead, cost });
    return rec;
  }

  async addEvent(leadId: string, eventType: string, detail?: unknown) {
    this.events.push({ leadId, eventType, detail });
  }

  async supersedeLead(leadId: string, byCallId: string) {
    const l = this.leads.get(leadId);
    if (l) l.supersededByCallId = byCallId;
    for (const row of this.outbox.values()) {
      if (row.leadId === leadId && row.status === "pending") row.status = "cancelled";
    }
  }

  async enqueueOutbox(r: { idempotencyKey: string; operation: string; leadId: string | null; payload: unknown; runAfter: Date }) {
    if ([...this.outbox.values()].some((x) => x.idempotencyKey === r.idempotencyKey)) return;
    const row: OutboxRow = { id: randomUUID(), idempotencyKey: r.idempotencyKey, operation: r.operation, leadId: r.leadId, payload: r.payload, status: "pending", attempts: 0, nextAttemptAt: r.runAfter, lastError: null };
    this.outbox.set(row.id, row);
  }

  async claimDueOutbox(now: Date, limit: number, lockMs: number) {
    const due = [...this.outbox.values()].filter((r) => r.status === "pending" && r.nextAttemptAt <= now).slice(0, limit);
    for (const r of due) r.nextAttemptAt = new Date(now.getTime() + lockMs);
    return due.map((r) => ({ ...r }));
  }

  async updateOutboxPayload(id: string, payload: unknown) {
    const r = this.outbox.get(id);
    if (r) r.payload = payload;
  }

  async completeOutbox(id: string) {
    const r = this.outbox.get(id);
    if (r) r.status = "done";
  }

  async failOutbox(id: string, error: string, nextAttemptAt: Date | null) {
    const r = this.outbox.get(id);
    if (!r) return;
    r.attempts += 1;
    r.lastError = error;
    if (nextAttemptAt) r.nextAttemptAt = nextAttemptAt;
    else r.status = "dead";
  }

  async setLeadHubspotIds(leadId: string, ids: { contactId: string | null; dealId: string | null }) {
    const l = this.leads.get(leadId);
    if (l) {
      l.hubspotContactId = ids.contactId;
      l.hubspotDealId = ids.dealId;
    }
  }

  async logSync(e: { outboxId: string | null; leadId: string | null; operation: string; ok: boolean; httpStatus?: number; detail?: unknown }) {
    this.syncLog.push(e);
  }
}
