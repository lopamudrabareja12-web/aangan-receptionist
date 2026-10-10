import type { SupabaseClient } from "@supabase/supabase-js";
import type { Decision } from "@/lib/domain";
import type { CallCost } from "./costs";
import type { CallRecord, LeadRecord, NewLead, OutboxRow, PipelineStore, RecentCall, Settings } from "./store";

// Production store. NOTE: typechecked and written against the schema in supabase/migrations, but only exercised
// against a real Supabase project at the smoke test (the in-memory store covers all pipeline logic in tests).

function must<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
  return res.data;
}

type CallRow = {
  id: string; vaani_call_id: string; caller_number: string | null; started_at: string; duration_sec: number | null;
  language: string | null; transcript: string | null; raw_payload: unknown; is_historical: boolean; status: CallRecord["status"];
};
const toCall = (r: CallRow): CallRecord => ({
  id: r.id, vaaniCallId: r.vaani_call_id, callerNumber: r.caller_number, startedAt: new Date(r.started_at), durationSec: r.duration_sec,
  language: r.language, transcript: r.transcript ?? "", rawPayload: r.raw_payload, isHistorical: r.is_historical, status: r.status,
});

export class SupabaseStore implements PipelineStore {
  constructor(private readonly db: SupabaseClient) {}

  async getSettings(): Promise<Settings> {
    const r = must(await this.db.from("settings").select("*").eq("id", 1).single(), "read settings");
    return {
      voice_rate_inr_per_min: Number(r.voice_rate_inr_per_min), gemini_input_usd_per_m: Number(r.gemini_input_usd_per_m),
      gemini_output_usd_per_m: Number(r.gemini_output_usd_per_m), usd_inr: Number(r.usd_inr), avg_project_value_inr: Number(r.avg_project_value_inr),
    };
  }

  async insertCall(c: Omit<CallRecord, "id" | "status">) {
    const existing = must(await this.db.from("calls").select("*").eq("vaani_call_id", c.vaaniCallId).maybeSingle(), "find call");
    if (existing) return { call: toCall(existing as CallRow), created: false };
    const ins = await this.db.from("calls").insert({
      vaani_call_id: c.vaaniCallId, caller_number: c.callerNumber, started_at: c.startedAt.toISOString(), duration_sec: c.durationSec,
      language: c.language, transcript: c.transcript, raw_payload: c.rawPayload, is_historical: c.isHistorical,
    }).select("*").single();
    if (ins.error?.code === "23505") {
      // two deliveries raced; the other one won
      const again = must(await this.db.from("calls").select("*").eq("vaani_call_id", c.vaaniCallId).single(), "re-read call");
      return { call: toCall(again as CallRow), created: false };
    }
    return { call: toCall(must(ins, "insert call") as CallRow), created: true };
  }

  async setCallStatus(callId: string, status: CallRecord["status"], error?: string) {
    must(await this.db.from("calls").update({ status, error: error ?? null }).eq("id", callId), "set call status");
  }

  async recentCallsFromNumber(number: string, since: Date, excludeCallId: string): Promise<RecentCall[]> {
    const calls = must(
      await this.db.from("calls").select("id, started_at").eq("caller_number", number).gte("started_at", since.toISOString()).neq("id", excludeCallId),
      "recent calls",
    ) as { id: string; started_at: string }[];
    if (!calls.length) return [];
    const leads = must(
      await this.db.from("leads").select("id, call_id, decision, superseded_by_call_id").in("call_id", calls.map((c) => c.id)),
      "recent leads",
    ) as { id: string; call_id: string; decision: Decision; superseded_by_call_id: string | null }[];
    return calls.map((c) => {
      const l = leads.find((x) => x.call_id === c.id);
      return { callId: c.id, startedAt: new Date(c.started_at), leadId: l?.id ?? null, decision: l?.decision ?? null, supersededByCallId: l?.superseded_by_call_id ?? null };
    });
  }

  async saveLead(lead: NewLead, cost: CallCost): Promise<LeadRecord> {
    const x = lead.extraction;
    const row = must(
      await this.db.from("leads").upsert({
        call_id: lead.callId, name: lead.name, phone: lead.phone, location: x?.location ?? null, property_type: x?.property_type ?? null,
        carpet_area_sqft: x?.carpet_area_sqft ?? null, scope_summary: x?.scope_summary ?? null, rooms: x?.rooms ?? null,
        whole_or_partial: x?.whole_or_partial ?? null, furniture_needed: x?.furniture_needed ?? null, storage_needs: x?.storage_needs ?? null,
        structural_work: x?.structural_work ?? null, property_status: x?.property_status ?? null, timeline_text: x?.timeline_text ?? null,
        ready_by_date: x?.ready_by_date ?? null, owner_status: x && x.owner_status !== "unknown" ? x.owner_status : null,
        decision_maker_confirmed: x?.decision_maker_confirmed ?? null, budget_volunteered: x?.budget_volunteered_inr ? String(x.budget_volunteered_inr) : null,
        referral_source: x?.referral_source ?? null, is_vip: lead.rubric.flags.includes("vip"), flags: lead.rubric.flags,
        decision: lead.rubric.decision, decline_reason: lead.rubric.reasonCode, decline_detail: lead.rubric.detail, revisit_on: lead.rubric.revisitOn,
        extraction: x, missing_fields: lead.rubric.missingFields, summary: lead.summary, price_asked: lead.priceAsked,
        reason_code: lead.rubric.reasonCode, rubric_version: lead.rubricVersion,
      }, { onConflict: "call_id" }).select("id, call_id, name, phone, decision, reason_code, flags, superseded_by_call_id, hubspot_contact_id, hubspot_deal_id").single(),
      "save lead",
    )!;
    must(
      await this.db.from("costs").upsert({
        call_id: lead.callId, voice_minutes: cost.voiceMinutes, voice_cost: cost.voiceCostInr, llm_input_tokens: cost.llmInputTokens,
        llm_output_tokens: cost.llmOutputTokens, llm_cost: cost.llmCostInr,
      }, { onConflict: "call_id" }),
      "save cost",
    );
    return {
      id: row.id, callId: row.call_id, name: row.name, phone: row.phone, decision: row.decision, reasonCode: row.reason_code, flags: row.flags,
      supersededByCallId: row.superseded_by_call_id, hubspotContactId: row.hubspot_contact_id, hubspotDealId: row.hubspot_deal_id,
    };
  }

  async addEvent(leadId: string, eventType: string, detail?: unknown) {
    must(await this.db.from("lead_events").insert({ lead_id: leadId, event_type: eventType, actor: "system", detail: detail ?? null }), "add event");
  }

  async supersedeLead(leadId: string, byCallId: string) {
    must(await this.db.from("leads").update({ superseded_by_call_id: byCallId }).eq("id", leadId), "supersede lead");
    must(await this.db.from("hubspot_outbox").update({ status: "cancelled", hold_reason: "superseded by redial" }).eq("lead_id", leadId).eq("status", "pending"), "cancel outbox");
  }

  async enqueueOutbox(r: { idempotencyKey: string; operation: string; leadId: string | null; payload: unknown; runAfter: Date }) {
    must(
      await this.db.from("hubspot_outbox").upsert(
        { idempotency_key: r.idempotencyKey, operation: r.operation, lead_id: r.leadId, payload: r.payload, next_attempt_at: r.runAfter.toISOString() },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      ),
      "enqueue outbox",
    );
  }

  async claimDueOutbox(now: Date, limit: number, lockMs: number): Promise<OutboxRow[]> {
    const due = must(
      await this.db.from("hubspot_outbox").select("*").eq("status", "pending").lte("next_attempt_at", now.toISOString()).order("next_attempt_at").limit(limit),
      "find due outbox",
    ) as Record<string, unknown>[];
    const claimed: OutboxRow[] = [];
    for (const r of due) {
      // optimistic lock: only the worker whose update matches the old next_attempt_at gets the row
      const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
      const got = must(
        await this.db.from("hubspot_outbox").update({ next_attempt_at: lockedUntil }).eq("id", r.id as string).eq("status", "pending").eq("next_attempt_at", r.next_attempt_at as string).select("*"),
        "lock outbox row",
      ) as Record<string, unknown>[];
      if (got[0]) {
        claimed.push({
          id: got[0].id as string, idempotencyKey: got[0].idempotency_key as string, operation: got[0].operation as string, leadId: got[0].lead_id as string | null,
          payload: got[0].payload, status: "pending", attempts: got[0].attempts as number, nextAttemptAt: new Date(lockedUntil), lastError: got[0].last_error as string | null,
        });
      }
    }
    return claimed;
  }

  async updateOutboxPayload(id: string, payload: unknown) {
    must(await this.db.from("hubspot_outbox").update({ payload }).eq("id", id), "save outbox progress");
  }

  async completeOutbox(id: string, now: Date) {
    must(await this.db.from("hubspot_outbox").update({ status: "done", done_at: now.toISOString(), last_error: null }).eq("id", id), "complete outbox");
  }

  async failOutbox(id: string, error: string, nextAttemptAt: Date | null) {
    const cur = must(await this.db.from("hubspot_outbox").select("attempts").eq("id", id).single(), "read attempts") as { attempts: number };
    must(
      await this.db.from("hubspot_outbox").update({
        attempts: cur.attempts + 1, last_error: error,
        ...(nextAttemptAt ? { next_attempt_at: nextAttemptAt.toISOString() } : { status: "dead" }),
      }).eq("id", id),
      "fail outbox",
    );
  }

  async setLeadHubspotIds(leadId: string, ids: { contactId: string | null; dealId: string | null }) {
    must(await this.db.from("leads").update({ hubspot_contact_id: ids.contactId, hubspot_deal_id: ids.dealId }).eq("id", leadId), "save hubspot ids");
  }

  async logSync(e: { outboxId: string | null; leadId: string | null; operation: string; ok: boolean; httpStatus?: number; detail?: unknown }) {
    must(
      await this.db.from("hubspot_sync_log").insert({ outbox_id: e.outboxId, lead_id: e.leadId, operation: e.operation, ok: e.ok, http_status: e.httpStatus ?? null, detail: e.detail ?? null }),
      "log sync",
    );
  }
}
