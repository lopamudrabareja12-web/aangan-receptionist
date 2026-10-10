// Live smoke test of the production store against the Supabase project in .env.local.
// Pushes ONE clearly fake call through the real pipeline (HubSpot is a MOCK here), checks every table, then deletes its own rows.
//   npm run supabase:smoke
import { existsSync } from "node:fs";
import { HubSpotClient } from "@/lib/hubspot/client";
import { processCall } from "@/lib/pipeline/process-call";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { runOutbox } from "@/lib/pipeline/sync";
import { getSupabase } from "@/lib/supabase/server";
import { GoldenExtractor } from "@/replay/golden";
import { MockHubSpot } from "@/replay/mock-hubspot";
import { loadPhoneTranscripts } from "@/replay/transcripts";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const db = getSupabase();
  const store = new SupabaseStore(db);
  const t01 = loadPhoneTranscripts().find((c) => c.id === "T01")!;
  const vaaniCallId = `SMOKE-TEST-${Date.now()}`;
  const golden = new GoldenExtractor();
  golden.current = "T01";
  const call = { vaaniCallId, callerNumber: "+919000000000", startedAt: new Date(), durationSec: 252, language: "en", callerName: null, transcript: t01.transcript };
  const deps = { store, extractor: golden };
  const ok = (label: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`); if (!cond) process.exitCode = 1; };

  try {
    const first = await processCall(deps, call, { rawPayload: { fake: true }, isHistorical: true });
    ok("call processed and stored", first.status === "processed", first.status === "processed" ? first.decision : "");
    const again = await processCall(deps, call, { isHistorical: true });
    ok("same call delivered twice is a duplicate (idempotent)", again.status === "duplicate");

    const calls = (await db.from("calls").select("*").eq("vaani_call_id", vaaniCallId)).data ?? [];
    ok("exactly one call row, marked processed and historical", calls.length === 1 && calls[0].status === "processed" && calls[0].is_historical === true);
    const leads = (await db.from("leads").select("*").eq("call_id", calls[0]?.id)).data ?? [];
    const l = leads[0];
    ok("exactly one lead with the extracted fields", leads.length === 1 && l.location === "Kothrud (Dahanukar Colony)" && l.carpet_area_sqft === 1400 && l.decision === "qualified", l ? `${l.decision}, ${l.carpet_area_sqft} sq ft` : "");
    ok("lead has no stage/owner columns (HubSpot owns those)", l && !("stage" in l) && !("designer_id" in l));
    ok("extraction audit stored as JSON, de-identified (no caller name)", !!l?.extraction && !JSON.stringify(l.extraction).includes("Priya"));
    const cost = (await db.from("costs").select("*").eq("call_id", calls[0]?.id)).data ?? [];
    ok("cost row written", cost.length === 1 && Number(cost[0].voice_minutes) === 4.2, cost[0] ? `voice Rs ${cost[0].voice_cost}` : "");
    const events = (await db.from("lead_events").select("event_type").eq("lead_id", l?.id)).data ?? [];
    ok("audit event recorded", events.some((e) => e.event_type === "created"));
    const ob = (await db.from("hubspot_outbox").select("*").eq("lead_id", l?.id)).data ?? [];
    ok("one HubSpot write queued, pending", ob.length === 1 && ob[0].status === "pending");

    // run the outbox against a MOCK HubSpot to exercise claim / progress / complete on the real database
    const hub = new MockHubSpot();
    const client = new HubSpotClient({ token: "mock", fetch: hub.fetch, sleep: async () => {} });
    const run = await runOutbox({ store, client, now: new Date(Date.now() + 1000) });
    ok("outbox claimed and completed against the mock", run.done === 1 && hub.deals.length === 1, JSON.stringify(run));
    const done = (await db.from("hubspot_outbox").select("status, attempts").eq("lead_id", l?.id)).data ?? [];
    ok("outbox row marked done", done[0]?.status === "done");
    const lead2 = (await db.from("leads").select("hubspot_deal_id, hubspot_contact_id").eq("id", l?.id).single()).data;
    ok("HubSpot ids saved on the lead", !!lead2?.hubspot_deal_id && !!lead2?.hubspot_contact_id);
    const log = (await db.from("hubspot_sync_log").select("ok").eq("lead_id", l?.id)).data ?? [];
    ok("sync log written", log.some((x) => x.ok === true));
    const nobody = await runOutbox({ store, client, now: new Date(Date.now() + 5000) });
    ok("a second outbox run finds nothing left to do", nobody.processed === 0);
  } finally {
    const ids = ((await db.from("calls").select("id").like("vaani_call_id", "SMOKE-TEST-%")).data ?? []).map((r) => r.id);
    if (ids.length) {
      await db.from("hubspot_sync_log").delete().in("lead_id", ((await db.from("leads").select("id").in("call_id", ids)).data ?? []).map((r) => r.id));
      await db.from("calls").delete().in("id", ids); // cascades to leads, costs, events, outbox
    }
    const left = await db.from("calls").select("*", { count: "exact", head: true }).like("vaani_call_id", "SMOKE-TEST-%");
    console.log(`cleanup: smoke-test rows left in calls = ${left.count}`);
  }
}

main().catch((e) => { console.error("SMOKE TEST FAILED:", String(e instanceof Error ? e.message : e)); process.exit(1); });
