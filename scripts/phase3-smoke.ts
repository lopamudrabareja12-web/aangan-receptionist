// Live test of Phase 3 against the REAL Supabase project and the REAL HubSpot portal in .env.local.
// Email is a stand-in (printed, not sent). Creates two clearly fake leads, claims one by link, lets the other auto-assign,
// checks HubSpot, then deletes everything it created.   npm run phase3:smoke
import { existsSync } from "node:fs";
import { HubSpotClient } from "@/lib/hubspot/client";
import { countOpenDeals, resolveStageIds } from "@/lib/hubspot/crm";
import { PIPELINE_LABEL } from "@/lib/hubspot/stages";
import type { Mail, Mailer } from "@/lib/mail/resend";
import { claimByLink, enqueueClaim } from "@/lib/pipeline/claim";
import { runAutoAssign, runNotifications } from "@/lib/pipeline/notify";
import { processCall } from "@/lib/pipeline/process-call";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { runOutbox } from "@/lib/pipeline/sync";
import { getSupabase } from "@/lib/supabase/server";
import { GoldenExtractor } from "@/replay/golden";
import { loadPhoneTranscripts } from "@/replay/transcripts";
import { claimUrl } from "@/lib/claim-token";

class ConsoleMailer implements Mailer {
  sent: Mail[] = [];
  async send(m: Mail) { this.sent.push(m); return { id: `fake-${this.sent.length}` }; }
}
let failures = 0;
const check = (label: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`); if (!ok) failures++; };

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const secret = process.env.CLAIM_LINK_SECRET!;
  const db = getSupabase();
  const store = new SupabaseStore(db);
  const hub = new HubSpotClient({ token: process.env.HUBSPOT_ACCESS_TOKEN! });
  const mailer = new ConsoleMailer();
  const stamp = Date.now();
  const transcripts = Object.fromEntries(loadPhoneTranscripts().map((c) => [c.id, c]));
  const nikhil = "nikhil-smoke@example.test";
  const created = { dealIds: new Set<string>(), contactIds: new Set<string>(), noteIds: new Set<string>(), taskIds: new Set<string>() };
  const base = (now: Date) => ({ store, mailer, now, baseUrl: process.env.APP_BASE_URL!, secret, nikhilEmail: nikhil, timeoutMinutes: 15 });

  try {
    const designers = (await store.listDesigners()).filter((d) => d.onDuty && d.hubspotOwnerId);
    check("at least one on-duty designer is linked to a HubSpot user", designers.length >= 1, designers.map((d) => d.name).join(", "));

    // two fake leads (qualified), arriving now
    const leadIds: string[] = [];
    for (const [i, id] of (["T01", "T06"] as const).entries()) {
      const g = new GoldenExtractor();
      g.current = id;
      const t = transcripts[id];
      const out = await processCall(
        { store, extractor: g },
        { vaaniCallId: `SMOKE3-${stamp}-${i}`, callerNumber: `+9190000003${i}0`, startedAt: new Date(), durationSec: t.durationSec, language: "en", callerName: null, transcript: t.transcript },
        { isHistorical: true },
      );
      if (out.status !== "processed") throw new Error("not processed");
      leadIds.push(out.leadId);
    }
    check("two fake qualified leads processed, each with a pending assignment", (await Promise.all(leadIds.map((l) => store.getAssignment(l)))).every((a) => a?.status === "awaiting_notify"));
    // make them due now even if the studio is closed
    await db.from("lead_assignments").update({ notify_at: new Date(Date.now() - 60_000).toISOString() }).in("lead_id", leadIds);

    await runOutbox({ store, client: hub, now: new Date() });
    const rows = (await db.from("leads").select("id, hubspot_deal_id, hubspot_contact_id").in("id", leadIds)).data ?? [];
    for (const r of rows) { if (r.hubspot_deal_id) created.dealIds.add(r.hubspot_deal_id); if (r.hubspot_contact_id) created.contactIds.add(r.hubspot_contact_id); }
    check("both leads reached HubSpot as deals", rows.every((r) => !!r.hubspot_deal_id));

    const n = await runNotifications(base(new Date()));
    check("designer(s) emailed once per lead, with a working claim link", n.designerEmails === designers.length * 2 && mailer.sent.every((m) => /\/claim\//.test(m.text)), `${n.designerEmails} emails (stand-in), ${n.errors.length} errors`);
    check("claim clock started (deadline set)", (await Promise.all(leadIds.map((l) => store.getAssignment(l)))).every((a) => a?.status === "notified" && a.claimDeadline !== null));

    // lead 1: claimed through the link
    const d = designers[0];
    const url = new URL(claimUrl(process.env.APP_BASE_URL!, secret, leadIds[0], d.id));
    const claim = await claimByLink({ store, secret, now: new Date() }, leadIds[0], d.id, url.searchParams.get("t"));
    check("lead 1: claim through the emailed link succeeds", claim.status === "claimed");
    const again = await claimByLink({ store, secret, now: new Date() }, leadIds[0], d.id, url.searchParams.get("t"));
    check("lead 1: pressing again is harmless", again.status === "already_yours");
    const forged = await claimByLink({ store, secret, now: new Date() }, leadIds[1], d.id, "forged");
    check("lead 2: a forged link claims nothing", forged.status === "invalid");

    // lead 2: nobody claims -> auto-assign after the deadline (we move the deadline into the past)
    await db.from("lead_assignments").update({ claim_deadline: new Date(Date.now() - 60_000).toISOString() }).eq("lead_id", leadIds[1]);
    const { pipelineId } = await resolveStageIds(hub, PIPELINE_LABEL);
    const assign = await runAutoAssign({ ...base(new Date()), openDeals: (o) => countOpenDeals(hub, o, pipelineId) }, (a, des) => enqueueClaim(store, a, des, "auto", new Date()));
    check("lead 2: auto-assigned after the window", assign.assigned === 1 && assign.errors.length === 0, JSON.stringify(assign));
    check("Nikhil was alerted about the auto-assignment (stand-in email)", mailer.sent.some((m) => m.to === nikhil && /auto-assigned/i.test(m.subject)));

    // push both owner changes to HubSpot and read the deals back
    await runOutbox({ store, client: hub, now: new Date() });
    const { stageIds } = await resolveStageIds(hub, PIPELINE_LABEL);
    for (const [i, dealId] of rows.map((r) => r.hubspot_deal_id as string).entries()) {
      const deal = await hub.request<{ properties: Record<string, string | null> }>("GET", `/crm/v3/objects/deals/${dealId}?properties=hubspot_owner_id,dealstage,dealname`);
      check(`lead ${i + 1}: HubSpot deal owner is the designer and the stage is Claimed`, deal.properties.hubspot_owner_id === d.hubspotOwnerId && deal.properties.dealstage === stageIds.claimed, deal.properties.dealname ?? "");
    }
    const events = (await db.from("lead_events").select("event_type").in("lead_id", leadIds)).data ?? [];
    check("audit trail has the claim, the auto-assignment and the HubSpot owner writes", ["claimed", "auto_assigned", "hubspot_owner_set"].every((t) => events.some((e) => e.event_type === t)));

    // collect HubSpot objects to delete
    const ob = (await db.from("hubspot_outbox").select("payload").in("lead_id", leadIds)).data ?? [];
    for (const o of ob) {
      const p = (o.payload ?? {}) as { progress?: { noteId?: string; taskIds?: string[] } };
      if (p.progress?.noteId) created.noteIds.add(p.progress.noteId);
      for (const t of p.progress?.taskIds ?? []) created.taskIds.add(t);
    }
  } finally {
    // clean up HubSpot (archive) and Supabase
    const del = async (path: string, ids: Set<string>) => { for (const id of ids) { try { await hub.request("DELETE", `${path}/${id}`); } catch { /* already gone */ } } };
    await del("/crm/v3/objects/notes", created.noteIds);
    await del("/crm/v3/objects/tasks", created.taskIds);
    await del("/crm/v3/objects/deals", created.dealIds);
    await del("/crm/v3/objects/contacts", created.contactIds);
    const ids = ((await db.from("calls").select("id").like("vaani_call_id", "SMOKE3-%")).data ?? []).map((r) => r.id);
    if (ids.length) {
      const lids = ((await db.from("leads").select("id").in("call_id", ids)).data ?? []).map((r) => r.id);
      if (lids.length) await db.from("hubspot_sync_log").delete().in("lead_id", lids);
      await db.from("calls").delete().in("id", ids);
    }
    const left = await db.from("calls").select("*", { count: "exact", head: true }).like("vaani_call_id", "SMOKE3-%");
    console.log(`cleanup: HubSpot deleted ${created.dealIds.size} deals, ${created.contactIds.size} contacts, ${created.noteIds.size} notes, ${created.taskIds.size} tasks; Supabase test rows left: ${left.count}`);
  }
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error("SMOKE TEST FAILED:", String(e instanceof Error ? e.message : e)); process.exit(1); });
