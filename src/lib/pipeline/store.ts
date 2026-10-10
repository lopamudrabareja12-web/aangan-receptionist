import type { Decision } from "@/lib/domain";
import type { CallCost, CostRates } from "./costs";
import type { Extraction } from "./extraction-schema";
import type { RubricResult } from "./rubric";

export interface Settings extends CostRates {
  avg_project_value_inr: number;
}

export interface CallRecord {
  id: string;
  vaaniCallId: string;
  callerNumber: string | null;
  startedAt: Date;
  durationSec: number | null;
  language: string | null;
  transcript: string;
  rawPayload: unknown;
  isHistorical: boolean;
  status: "received" | "processing" | "processed" | "failed";
}

export interface LeadRecord {
  id: string;
  callId: string;
  name: string | null;
  phone: string | null;
  decision: Decision;
  reasonCode: string | null;
  flags: string[];
  supersededByCallId: string | null;
  hubspotContactId: string | null;
  hubspotDealId: string | null;
}

export interface NewLead {
  callId: string;
  name: string | null;
  phone: string | null;
  extraction: Extraction | null; // de-identified model output (audit)
  rubric: RubricResult;
  summary: string | null;
  priceAsked: boolean;
  rubricVersion: string;
}

export type OutboxStatus = "pending" | "done" | "dead" | "cancelled";

export interface OutboxRow {
  id: string;
  idempotencyKey: string;
  operation: string;
  leadId: string | null;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
}

export interface RecentCall {
  callId: string;
  startedAt: Date;
  leadId: string | null;
  decision: Decision | null;
  supersededByCallId: string | null;
}

/** Everything the pipeline needs from storage. Implemented in memory (tests, Replay Lab) and on Supabase (production). */
export interface PipelineStore {
  getSettings(): Promise<Settings>;
  /** Idempotent on vaaniCallId. If the call already exists, returns it with created=false. */
  insertCall(call: Omit<CallRecord, "id" | "status">): Promise<{ call: CallRecord; created: boolean }>;
  setCallStatus(callId: string, status: CallRecord["status"], error?: string): Promise<void>;
  recentCallsFromNumber(number: string, since: Date, excludeCallId: string): Promise<RecentCall[]>;
  saveLead(lead: NewLead, cost: CallCost): Promise<LeadRecord>;
  addEvent(leadId: string, eventType: string, detail?: unknown): Promise<void>;
  /** Marks a lead as replaced by a later call and cancels its not-yet-sent HubSpot writes. */
  supersedeLead(leadId: string, byCallId: string): Promise<void>;
  enqueueOutbox(row: { idempotencyKey: string; operation: string; leadId: string | null; payload: unknown; runAfter: Date }): Promise<void>;
  /** Returns due rows and pushes their next attempt out by lockMs so two workers do not both take them. */
  claimDueOutbox(now: Date, limit: number, lockMs: number): Promise<OutboxRow[]>;
  updateOutboxPayload(id: string, payload: unknown): Promise<void>;
  completeOutbox(id: string, now: Date): Promise<void>;
  failOutbox(id: string, error: string, nextAttemptAt: Date | null, now: Date): Promise<void>; // null => dead
  setLeadHubspotIds(leadId: string, ids: { contactId: string | null; dealId: string | null }): Promise<void>;
  logSync(entry: { outboxId: string | null; leadId: string | null; operation: string; ok: boolean; httpStatus?: number; detail?: unknown }): Promise<void>;
}
