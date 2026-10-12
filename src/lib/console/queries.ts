import { connection } from "next/server";
import { requireSignedIn } from "./auth";
import { HubSpotClient } from "@/lib/hubspot/client";
import { listPipelineDeals, resolveStageIds } from "@/lib/hubspot/crm";
import { PIPELINE_LABEL, STAGES, stageByKey } from "@/lib/hubspot/stages";
import { getSupabase } from "@/lib/supabase/server";
import type { Decision } from "@/lib/domain";

// Read-only queries for the console. Live calls only: replay data is never stored in these tables (is_historical = false).

const must = <T>(res: { data: T; error: { message: string } | null }, what: string): T => {
  if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
  return res.data;
};

/** Console data is always live. Waiting for the request keeps Next from trying to prerender (and freeze) the current time. */
const live = async () => {
  await connection();
  await requireSignedIn(); // every read checks the session itself: a layout redirect does not stop a page from rendering
};

const istHour = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(iso)));

export interface Overview {
  days: number;
  calls: number;
  afterHours: number;
  failedOrStuck: number;
  byDecision: Record<Decision, number>;
  forwarded: number;
  avgProjectValue: number;
}

export async function getOverview(days = 30): Promise<Overview> {
  await live();
  const db = getSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [calls, leads, settings] = await Promise.all([
    db.from("calls").select("id, started_at, status, created_at").eq("is_historical", false).gte("created_at", since).limit(2000),
    db.from("leads").select("decision, superseded_by_call_id, calls!call_id!inner(is_historical, created_at)").eq("calls.is_historical", false).gte("calls.created_at", since).limit(2000),
    db.from("settings").select("avg_project_value_inr").eq("id", 1).single(),
  ]);
  const c = must(calls, "overview calls") as { started_at: string | null; status: string; created_at: string }[];
  const l = must(leads, "overview leads") as unknown as { decision: Decision; superseded_by_call_id: string | null }[];
  const byDecision: Record<Decision, number> = { qualified: 0, qualified_flagged: 0, declined: 0, deferred: 0, escalation: 0, incomplete: 0 };
  for (const row of l) if (!row.superseded_by_call_id) byDecision[row.decision]++;
  const hours = c.map((x) => istHour(x.started_at ?? x.created_at));
  return {
    days, calls: c.length, afterHours: hours.filter((h) => h < 10 || h >= 19).length,
    failedOrStuck: c.filter((x) => x.status !== "processed" && Date.now() - new Date(x.created_at).getTime() > 5 * 60_000).length,
    byDecision, forwarded: byDecision.qualified + byDecision.qualified_flagged,
    avgProjectValue: Number(must(settings, "settings")!.avg_project_value_inr),
  };
}

export interface StageCount {
  label: string;
  count: number;
}

/** Funnel by stage, read from HubSpot (the source of truth for stage). Returns an error message instead of throwing so the page still renders. */
export async function getHubspotFunnel(): Promise<{ stages: StageCount[]; total: number } | { error: string }> {
  await live();
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return { error: "HUBSPOT_ACCESS_TOKEN is not set." };
  try {
    const client = new HubSpotClient({ token });
    const { pipelineId, stageIds } = await resolveStageIds(client, PIPELINE_LABEL);
    const deals = await listPipelineDeals(client, pipelineId);
    const stages = STAGES.map((s) => ({ label: stageByKey(s.key).label, count: deals.filter((d) => d.stageId === stageIds[s.key]).length }));
    return { stages, total: deals.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : "HubSpot could not be read." };
  }
}

export interface DeclinedRow {
  id: string;
  callId: string;
  name: string | null;
  phone: string | null;
  location: string | null;
  reason: string | null;
  detail: string | null;
  summary: string | null;
  createdAt: string;
  synced: boolean;
}

export async function getDeclined(): Promise<DeclinedRow[]> {
  await live();
  const rows = must(
    await getSupabase().from("leads").select("id, call_id, name, phone, location, decline_reason, decline_detail, summary, created_at, hubspot_deal_id, calls!call_id!inner(is_historical)")
      .eq("decision", "declined").is("superseded_by_call_id", null).eq("calls.is_historical", false).order("created_at", { ascending: false }).limit(200),
    "declined leads",
  ) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string, callId: r.call_id as string, name: (r.name as string) ?? null, phone: (r.phone as string) ?? null, location: (r.location as string) ?? null,
    reason: (r.decline_reason as string) ?? null, detail: (r.decline_detail as string) ?? null, summary: (r.summary as string) ?? null,
    createdAt: r.created_at as string, synced: !!r.hubspot_deal_id,
  }));
}

export interface CallDetail {
  call: { id: string; status: string; error: string | null; startedAt: string | null; durationSec: number | null; language: string | null; transcript: string; callerNumber: string | null };
  lead: Record<string, unknown> | null;
  noteText: string | null;
  events: { type: string; at: string; detail: unknown }[];
  cost: { voiceMinutes: number; voiceCost: number; llmCost: number } | null;
}

export async function getCallDetail(callId: string): Promise<CallDetail | null> {
  await live();
  const db = getSupabase();
  const call = must(await db.from("calls").select("id, status, error, started_at, duration_sec, language, transcript, caller_number").eq("id", callId).maybeSingle(), "call") as Record<string, unknown> | null;
  if (!call) return null;
  const lead = must(await db.from("leads").select("*").eq("call_id", callId).maybeSingle(), "lead") as Record<string, unknown> | null;
  const [assignment, events, cost] = await Promise.all([
    lead ? db.from("lead_assignments").select("note_text").eq("lead_id", lead.id as string).maybeSingle() : null,
    lead ? db.from("lead_events").select("event_type, created_at, detail").eq("lead_id", lead.id as string).order("created_at") : null,
    db.from("costs").select("voice_minutes, voice_cost, llm_cost").eq("call_id", callId).maybeSingle(),
  ]);
  const c = cost && !cost.error ? (cost.data as Record<string, unknown> | null) : null;
  return {
    call: {
      id: call.id as string, status: call.status as string, error: (call.error as string) ?? null, startedAt: (call.started_at as string) ?? null, durationSec: (call.duration_sec as number) ?? null,
      language: (call.language as string) ?? null, transcript: (call.transcript as string) ?? "", callerNumber: (call.caller_number as string) ?? null,
    },
    lead, noteText: assignment && !assignment.error ? ((assignment.data as { note_text: string } | null)?.note_text ?? null) : null,
    events: events && !events.error ? (events.data as { event_type: string; created_at: string; detail: unknown }[]).map((e) => ({ type: e.event_type, at: e.created_at, detail: e.detail })) : [],
    cost: c ? { voiceMinutes: Number(c.voice_minutes), voiceCost: Number(c.voice_cost), llmCost: Number(c.llm_cost) } : null,
  };
}

export interface HealthData {
  outbox: Record<string, number>;
  problems: { id: string; operation: string; status: string; attempts: number; nextAttemptAt: string; lastError: string | null; leadId: string | null }[];
  recentSync: { at: string; operation: string; ok: boolean; httpStatus: number | null; detail: unknown }[];
  stuckCalls: { id: string; status: string; error: string | null; createdAt: string }[];
}

export async function getHealth(): Promise<HealthData> {
  await live();
  const db = getSupabase();
  const [all, problems, log, stuck] = await Promise.all([
    db.from("hubspot_outbox").select("status").limit(5000),
    db.from("hubspot_outbox").select("id, operation, status, attempts, next_attempt_at, last_error, lead_id").in("status", ["dead", "pending"]).order("created_at", { ascending: false }).limit(50),
    db.from("hubspot_sync_log").select("created_at, operation, ok, http_status, detail").order("created_at", { ascending: false }).limit(15),
    db.from("calls").select("id, status, error, created_at").eq("is_historical", false).in("status", ["received", "processing", "failed"]).lte("created_at", new Date(Date.now() - 5 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(20),
  ]);
  const outbox: Record<string, number> = {};
  for (const r of must(all, "outbox") as { status: string }[]) outbox[r.status] = (outbox[r.status] ?? 0) + 1;
  return {
    outbox,
    problems: (must(problems, "outbox problems") as Record<string, unknown>[]).map((r) => ({
      id: r.id as string, operation: r.operation as string, status: r.status as string, attempts: r.attempts as number, nextAttemptAt: r.next_attempt_at as string, lastError: (r.last_error as string) ?? null, leadId: (r.lead_id as string) ?? null,
    })),
    recentSync: (must(log, "sync log") as Record<string, unknown>[]).map((r) => ({ at: r.created_at as string, operation: r.operation as string, ok: r.ok as boolean, httpStatus: (r.http_status as number) ?? null, detail: r.detail })),
    stuckCalls: (must(stuck, "stuck calls") as Record<string, unknown>[]).map((r) => ({ id: r.id as string, status: r.status as string, error: (r.error as string) ?? null, createdAt: r.created_at as string })),
  };
}

export interface CostsData {
  rows: { callId: string; when: string; minutes: number; voiceCost: number; llmCost: number; tokens: number }[];
  qualified: number;
  settings: Record<string, number>;
}

export async function getCosts(): Promise<CostsData> {
  await live();
  const db = getSupabase();
  const [costs, leads, settings] = await Promise.all([
    db.from("costs").select("call_id, voice_minutes, voice_cost, llm_input_tokens, llm_output_tokens, llm_cost, created_at, calls!call_id!inner(is_historical, started_at)").eq("calls.is_historical", false).order("created_at", { ascending: false }).limit(500),
    db.from("leads").select("id, decision, superseded_by_call_id, calls!call_id!inner(is_historical)").eq("calls.is_historical", false).in("decision", ["qualified", "qualified_flagged"]).is("superseded_by_call_id", null).limit(2000),
    db.from("settings").select("*").eq("id", 1).single(),
  ]);
  const s = must(settings, "settings") as Record<string, unknown>;
  const num: Record<string, number> = {};
  for (const k of ["voice_rate_inr_per_min", "gemini_input_usd_per_m", "gemini_output_usd_per_m", "usd_inr", "resend_monthly_inr", "hosting_monthly_inr", "conversion_rate", "avg_project_value_inr", "claim_timeout_minutes"]) num[k] = Number(s[k]);
  return {
    rows: (must(costs, "costs") as unknown as Record<string, unknown>[]).map((r) => ({
      callId: r.call_id as string, when: ((r.calls as { started_at: string | null } | null)?.started_at ?? (r.created_at as string)), minutes: Number(r.voice_minutes), voiceCost: Number(r.voice_cost),
      llmCost: Number(r.llm_cost), tokens: Number(r.llm_input_tokens) + Number(r.llm_output_tokens),
    })),
    qualified: (must(leads, "qualified leads") as unknown[]).length,
    settings: num,
  };
}

export async function getDesigners() {
  await live();
  const rows = must(await getSupabase().from("designers").select("id, name, email, on_duty, is_senior, hubspot_owner_id").order("name"), "designers") as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, email: r.email as string, onDuty: r.on_duty as boolean, isSenior: r.is_senior as boolean, linked: !!r.hubspot_owner_id }));
}
