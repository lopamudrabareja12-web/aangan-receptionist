import { normalizePhone } from "@/lib/phone";
import type { DealInput } from "@/lib/hubspot/deal-mapping";
import { parseVaaniEvent, type NormalizedCall } from "@/lib/vaani/adapter";
import { istMorning, nextWorkingStart } from "@/lib/time";
import { computeCallCost } from "./costs";
import type { Extractor } from "./extractor";
import type { Extraction } from "./extraction-schema";
import { composeHandoffNote } from "./handoff";
import { guessCallerName, redactForLlm } from "./redact";
import { applyRubric, istDate, RUBRIC_VERSION, type RubricResult } from "./rubric";
import type { CallRecord, PipelineStore, RecentCall } from "./store";
import type { SyncPayload } from "./sync";

export const DEDUPE_WINDOW_MS = 10 * 60_000;
/** A call where the caller said fewer words than this has no enquiry to read (missed, dropped, silent). */
export const MIN_CALLER_WORDS = 15;

export interface ProcessDeps {
  store: PipelineStore;
  extractor: Extractor;
  now?: () => Date;
  consoleBaseUrl?: string;
}

export type ProcessOutcome =
  | { status: "duplicate"; callId: string }
  | { status: "processed"; callId: string; leadId: string; decision: RubricResult["decision"]; reasonCode: string | null; supersededLeadIds: string[] };

const callerWordCount = (t: string) =>
  t.split("\n").filter((l) => /^caller:/i.test(l)).reduce((n, l) => n + l.replace(/^caller:/i, "").trim().split(/\s+/).filter(Boolean).length, 0);

/** Step 1: store the call. Fast (one write), so the webhook can answer Vaani within its 5-second limit. */
export async function receiveCall(
  store: PipelineStore,
  call: NormalizedCall,
  opts: { rawPayload?: unknown; isHistorical?: boolean } = {},
): Promise<{ call: CallRecord; created: boolean; duplicate: boolean }> {
  const phone = normalizePhone(call.callerNumber);
  const { call: row, created } = await store.insertCall({
    vaaniCallId: call.vaaniCallId, callerNumber: phone ?? call.callerNumber, startedAt: call.startedAt, durationSec: call.durationSec,
    language: call.language, transcript: call.transcript, rawPayload: opts.rawPayload ?? null, isHistorical: opts.isHistorical ?? false,
  });
  // A webhook delivered twice must do nothing the second time. A previously FAILED or stuck call is picked up again.
  return { call: row, created, duplicate: !created && (row.status === "processed" || row.status === "processing") };
}

/** Rebuilds the normalised call from what was stored, so a stuck call can be reprocessed later. */
export function callFromRecord(row: CallRecord): NormalizedCall {
  let name: string | null = null;
  try {
    const ev = parseVaaniEvent(row.rawPayload);
    if (ev.kind === "call") name = ev.call.callerName;
  } catch {
    /* the stored payload is not in the expected shape: carry on without a platform-supplied name */
  }
  return { vaaniCallId: row.vaaniCallId, callerNumber: row.callerNumber, startedAt: row.startedAt, durationSec: row.durationSec, language: row.language, callerName: name, transcript: row.transcript };
}

export async function processCall(
  deps: ProcessDeps,
  call: NormalizedCall,
  opts: { rawPayload?: unknown; isHistorical?: boolean } = {},
): Promise<ProcessOutcome> {
  const received = await receiveCall(deps.store, call, opts);
  if (received.duplicate) return { status: "duplicate", callId: received.call.id };
  return processReceived(deps, received.call, call);
}

/** Step 2: read, decide, save, queue. Slow (AI call), so it runs after the webhook has already replied. */
export async function processReceived(deps: ProcessDeps, row: CallRecord, call: NormalizedCall): Promise<ProcessOutcome> {
  const { store, extractor } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const phone = normalizePhone(call.callerNumber);
  await store.setCallStatus(row.id, "processing");

  try {
    const callerName = call.callerName ?? guessCallerName(call.transcript);
    let extraction: Extraction | null = null;
    let usage = { inputTokens: 0, outputTokens: 0 };
    let rubric: RubricResult;

    if (callerWordCount(call.transcript) < MIN_CALLER_WORDS) {
      // Nothing to read: skip the AI step entirely (no cost) and queue a human callback.
      rubric = { decision: "incomplete", reasonCode: "incomplete_call", detail: "Call ended before an enquiry could be taken (missed, dropped or silent).", flags: [], missingFields: [], revisitOn: null };
    } else {
      const redacted = redactForLlm(call.transcript, callerName);
      const result = await extractor.extract({ redactedTranscript: redacted.text, callDate: istDate(call.startedAt) });
      extraction = result.extraction;
      usage = result.usage;
      rubric = applyRubric({ extraction, callStartedAt: call.startedAt });
    }

    const settings = await store.getSettings();
    const cost = computeCallCost({ durationSec: call.durationSec, ...usage }, settings);
    const lead = await store.saveLead(
      { callId: row.id, name: callerName, phone, extraction, rubric, summary: extraction?.summary ?? null, priceAsked: extraction?.price_asked ?? false, rubricVersion: RUBRIC_VERSION },
      cost,
    );
    await store.addEvent(lead.id, "created", { decision: rubric.decision, reasonCode: rubric.reasonCode, flags: rubric.flags });

    // Dedupe (T17): a redial within 10 minutes replaces an earlier dropped call from the same number.
    const superseded: string[] = [];
    if (phone && rubric.decision !== "incomplete") {
      const since = new Date(call.startedAt.getTime() - DEDUPE_WINDOW_MS);
      const earlier: RecentCall[] = await store.recentCallsFromNumber(phone, since, row.id);
      for (const e of earlier) {
        if (e.leadId && e.decision === "incomplete" && !e.supersededByCallId) {
          await store.supersedeLead(e.leadId, row.id);
          await store.addEvent(e.leadId, "superseded", { byCallId: row.id });
          superseded.push(e.leadId);
        }
      }
    }

    // Queue the HubSpot write. A dropped call is held for the dedupe window in case the caller redials.
    const note = composeHandoffNote({
      extraction, rubric, callerName, callerPhone: phone, callStartedAt: call.startedAt, callId: row.id,
      consoleUrl: deps.consoleBaseUrl ? `${deps.consoleBaseUrl}/calls/${row.id}` : undefined,
    });
    const deal: DealInput = {
      callId: row.id, decision: rubric.decision, name: callerName, location: extraction?.location, propertyType: extraction?.property_type,
      carpetAreaSqft: extraction?.carpet_area_sqft, readyByDate: extraction?.ready_by_date, referralSource: extraction?.referral_source,
      isVip: rubric.flags.includes("vip"), flags: rubric.flags, declineDetail: rubric.detail, avgProjectValueInr: settings.avg_project_value_inr,
    };
    const payload: SyncPayload = {
      callId: row.id, leadId: lead.id, decision: rubric.decision, callerPhone: phone, callerName, deal, noteHtml: note.html,
      tasks: tasksFor(rubric, phone, call.startedAt), progress: {},
    };
    const hold = rubric.decision === "incomplete" ? new Date(call.startedAt.getTime() + DEDUPE_WINDOW_MS) : now;
    await store.enqueueOutbox({ idempotencyKey: `sync_lead:${row.id}`, operation: "sync_lead", leadId: lead.id, payload, runAfter: hold });

    // Who needs to be told: designers for a forwarded lead (claim), Nikhil at once for a complaint.
    if (rubric.decision === "qualified" || rubric.decision === "qualified_flagged" || rubric.decision === "escalation") {
      const escalation = rubric.decision === "escalation";
      const who = [callerName ?? "Unknown caller", extraction?.property_type, extraction?.location].filter(Boolean).join(" · ");
      const prefix = escalation ? "ESCALATION" : rubric.decision === "qualified_flagged" ? "New enquiry (check the flags)" : "New enquiry";
      await store.createAssignment({
        leadId: lead.id, kind: escalation ? "escalation" : "claim", notifyAt: escalation ? now : nextWorkingStart(now),
        subject: `${prefix}: ${who}`, noteText: note.text, noteHtml: note.html, isVip: rubric.flags.includes("vip"),
      });
    }

    await store.setCallStatus(row.id, "processed");
    return { status: "processed", callId: row.id, leadId: lead.id, decision: rubric.decision, reasonCode: rubric.reasonCode, supersededLeadIds: superseded };
  } catch (e) {
    await store.setCallStatus(row.id, "failed", e instanceof Error ? e.message.slice(0, 400) : "unknown error");
    throw e;
  }
}

function tasksFor(rubric: RubricResult, phone: string | null, startedAt: Date): SyncPayload["tasks"] {
  const tasks: SyncPayload["tasks"] = [];
  if (rubric.decision === "incomplete") {
    tasks.push({ subject: `Call back ${phone ?? "the caller"} (missed or dropped call)`, body: "The call ended before an enquiry could be taken. Call back in working hours.", dueAt: nextWorkingStart(startedAt).toISOString() });
  }
  if (rubric.decision === "escalation") {
    tasks.push({ subject: "URGENT: senior call back within 15 minutes", body: rubric.detail ?? "Existing client; not a new enquiry.", dueAt: new Date(startedAt.getTime() + 15 * 60_000).toISOString() });
  }
  if (rubric.revisitOn) {
    tasks.push({ subject: `Revisit this enquiry (${rubric.reasonCode ?? "later"})`, body: rubric.detail ?? "", dueAt: istMorning(rubric.revisitOn).toISOString() });
  }
  return tasks;
}
