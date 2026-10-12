import type { Decision } from "@/lib/domain";
import type { CallCost, CostRates } from "./costs";
import type { Extraction } from "./extraction-schema";
import type { RubricResult } from "./rubric";

export interface Settings extends CostRates {
  avg_project_value_inr: number;
  claim_timeout_minutes: number;
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

export type AssignmentStatus = "awaiting_notify" | "notified" | "claimed" | "auto_assigned";

export interface Assignment {
  leadId: string;
  kind: "claim" | "escalation";
  status: AssignmentStatus;
  notifyAt: Date;
  notifiedAt: Date | null;
  claimDeadline: Date | null;
  designerId: string | null;
  claimedAt: Date | null;
  via: "claim" | "auto" | null;
  nikhilAlertedAt: Date | null;
  subject: string;
  noteText: string;
  noteHtml: string;
  isVip: boolean;
  hubspotDealId: string | null; // from the lead
}

export interface Designer {
  id: string;
  name: string;
  email: string;
  onDuty: boolean;
  isSenior: boolean;
  hubspotOwnerId: string | null;
}

export interface VaaniCallMeta {
  callId: string;
  roomName: string | null;
  phoneNumber: string | null;
  callType: string | null;
  agentName: string | null;
  startedAt: Date | null;
}

export interface RecentCall {
  callId: string;
  startedAt: Date;
  leadId: string | null;
  decision: Decision | null;
  supersededByCallId: string | null;
}

export interface ReinstateCandidate {
  id: string;
  callId: string;
  decision: Decision;
  name: string | null;
  phone: string | null;
  flags: string[];
  extraction: unknown; // de-identified model output as stored; null when the AI step was skipped
  hubspotDealId: string | null;
  startedAt: Date;
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
  /** Vaani's call_started event: the caller's number and the start time, needed when the post-call event arrives. */
  saveCallMeta(meta: VaaniCallMeta): Promise<void>;
  getCallMeta(ids: string[]): Promise<VaaniCallMeta | null>;
  // --- Phase 3: notify and claim ---
  createAssignment(a: { leadId: string; kind: "claim" | "escalation"; notifyAt: Date; subject: string; noteText: string; noteHtml: string; isVip: boolean }): Promise<void>;
  getAssignment(leadId: string): Promise<Assignment | null>;
  /** Assignments whose email time has come AND whose HubSpot deal exists (escalations need no deal). */
  listDueNotifications(now: Date): Promise<Assignment[]>;
  /** Claims that were emailed but nobody took before the deadline. */
  listOverdueClaims(now: Date): Promise<Assignment[]>;
  markNotified(leadId: string, now: Date, claimDeadline: Date | null): Promise<boolean>;
  /** Atomic: only the first caller wins. Returns true if THIS call took the lead. */
  claimLead(leadId: string, designerId: string, via: "claim" | "auto", now: Date): Promise<boolean>;
  markNikhilAlerted(leadId: string, now: Date): Promise<void>;
  listDesigners(): Promise<Designer[]>;
  listEvents(leadId: string, eventType: string): Promise<{ detail: unknown }[]>;
  /** Calls stuck in received/processing/failed for longer than `olderThan`, oldest first. */
  listStaleCalls(olderThan: Date, limit: number): Promise<CallRecord[]>;
  // --- Phase 4: console ---
  getLeadForReinstate(leadId: string): Promise<ReinstateCandidate | null>;
  /** Atomic: only a lead still in "declined" changes. Returns true if THIS call reinstated it. */
  markReinstated(leadId: string, flags: string[]): Promise<boolean>;
  logSync(entry: { outboxId: string | null; leadId: string | null; operation: string; ok: boolean; httpStatus?: number; detail?: unknown }): Promise<void>;
}
