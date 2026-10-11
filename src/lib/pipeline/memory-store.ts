import { randomUUID } from "node:crypto";
import type { CallCost } from "./costs";
import { DEFAULT_RATES } from "./costs";
import type { Assignment, CallRecord, Designer, VaaniCallMeta, LeadRecord, NewLead, OutboxRow, PipelineStore, RecentCall, Settings } from "./store";

/** In-memory PipelineStore for tests and the Replay Lab. Nothing here touches Supabase or HubSpot. */
export class MemoryStore implements PipelineStore {
  calls = new Map<string, CallRecord>();
  leads = new Map<string, LeadRecord & { raw: NewLead; cost: CallCost }>();
  events: { leadId: string; eventType: string; detail?: unknown }[] = [];
  outbox = new Map<string, OutboxRow>();
  syncLog: { outboxId: string | null; leadId: string | null; operation: string; ok: boolean; httpStatus?: number; detail?: unknown }[] = [];
  callErrors = new Map<string, string>();
  assignments = new Map<string, Assignment>();
  callMeta = new Map<string, VaaniCallMeta>();
  designers: Designer[] = [];

  constructor(private settings: Settings = { ...DEFAULT_RATES, avg_project_value_inr: 1_100_000, claim_timeout_minutes: 15 }) {}

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

  async saveCallMeta(meta: VaaniCallMeta) {
    this.callMeta.set(meta.callId, meta);
  }

  async getCallMeta(ids: string[]) {
    for (const id of ids) {
      const hit = this.callMeta.get(id) ?? [...this.callMeta.values()].find((m) => m.roomName === id);
      if (hit) return hit;
    }
    return null;
  }

  // --- Phase 3 ---
  async createAssignment(a: { leadId: string; kind: "claim" | "escalation"; notifyAt: Date; subject: string; noteText: string; noteHtml: string; isVip: boolean }) {
    if (this.assignments.has(a.leadId)) return;
    this.assignments.set(a.leadId, {
      leadId: a.leadId, kind: a.kind, status: "awaiting_notify", notifyAt: a.notifyAt, notifiedAt: null, claimDeadline: null, designerId: null,
      claimedAt: null, via: null, nikhilAlertedAt: null, subject: a.subject, noteText: a.noteText, noteHtml: a.noteHtml, isVip: a.isVip, hubspotDealId: null,
    });
  }

  private withDeal(a: Assignment): Assignment {
    return { ...a, hubspotDealId: this.leads.get(a.leadId)?.hubspotDealId ?? null };
  }

  async getAssignment(leadId: string) {
    const a = this.assignments.get(leadId);
    return a ? this.withDeal(a) : null;
  }

  async listDueNotifications(now: Date) {
    return [...this.assignments.values()]
      .filter((a) => a.status === "awaiting_notify" && a.notifyAt <= now)
      .map((a) => this.withDeal(a))
      .filter((a) => a.kind === "escalation" || a.hubspotDealId !== null);
  }

  async listOverdueClaims(now: Date) {
    return [...this.assignments.values()]
      .filter((a) => a.kind === "claim" && a.status === "notified" && a.claimDeadline !== null && a.claimDeadline <= now)
      .map((a) => this.withDeal(a));
  }

  async markNotified(leadId: string, now: Date, claimDeadline: Date | null) {
    const a = this.assignments.get(leadId);
    if (!a || a.status !== "awaiting_notify") return false;
    a.status = "notified";
    a.notifiedAt = now;
    a.claimDeadline = claimDeadline;
    return true;
  }

  async claimLead(leadId: string, designerId: string, via: "claim" | "auto", now: Date) {
    const a = this.assignments.get(leadId);
    if (!a || a.kind !== "claim" || (a.status !== "awaiting_notify" && a.status !== "notified")) return false;
    a.status = via === "auto" ? "auto_assigned" : "claimed";
    a.designerId = designerId;
    a.claimedAt = now;
    a.via = via;
    return true;
  }

  async markNikhilAlerted(leadId: string, now: Date) {
    const a = this.assignments.get(leadId);
    if (a) a.nikhilAlertedAt = now;
  }

  async listDesigners() {
    return this.designers.map((d) => ({ ...d }));
  }

  async listEvents(leadId: string, eventType: string) {
    return this.events.filter((e) => e.leadId === leadId && e.eventType === eventType).map((e) => ({ detail: e.detail }));
  }

  async listStaleCalls(olderThan: Date, limit: number) {
    return [...this.calls.values()]
      .filter((c) => (c.status === "received" || c.status === "processing" || c.status === "failed") && c.startedAt <= olderThan)
      .sort((x, y) => x.startedAt.getTime() - y.startedAt.getTime())
      .slice(0, limit);
  }
}
