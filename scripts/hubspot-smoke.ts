// Live smoke test: pushes ONE clearly fake lead through the real sync code into the HubSpot portal in .env.local,
// checks that a repeat does not duplicate, and reads the records back. Creates real (fake) records: delete them afterwards.
//   npm run hubspot:smoke
import { existsSync } from "node:fs";
import { HubSpotClient } from "@/lib/hubspot/client";
import { upsertContact, upsertDeal, resolveStageIds } from "@/lib/hubspot/crm";
import { buildDealProperties, stageForDecision } from "@/lib/hubspot/deal-mapping";
import { PIPELINE_LABEL } from "@/lib/hubspot/stages";
import { syncLead, type SyncPayload } from "@/lib/pipeline/sync";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const portal = process.env.HUBSPOT_PORTAL_ID;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not set in .env.local");
  const c = new HubSpotClient({ token });

  const callId = `SMOKE-TEST-${Date.now()}`;
  const payload: SyncPayload = {
    callId, leadId: "smoke-lead", decision: "qualified", callerPhone: "+919000000000", callerName: "Test Caller",
    deal: { callId, decision: "qualified", name: "Test Caller", location: "Baner", propertyType: "2BHK (SMOKE TEST)", carpetAreaSqft: 999, readyByDate: "2027-03-31", referralSource: "smoke test", isVip: false, flags: [], avgProjectValueInr: 1_100_000 },
    noteHtml: "<p>SMOKE TEST: fake lead created by scripts/hubspot-smoke.ts. Safe to delete.</p>",
    tasks: [{ subject: "SMOKE TEST: ignore this task", body: "Created by the smoke test.", dueAt: new Date(Date.now() + 3600_000).toISOString() }],
    progress: {},
  };

  console.log("1) First sync (contact, deal, note, task)...");
  const p = await syncLead(c, payload, async () => {});
  console.log("   contact", p.contactId, "| deal", p.dealId, "| note", p.noteId, "| tasks", p.taskIds?.join(","));

  console.log("2) Duplicate protection: waiting 8s for HubSpot's search index, then upserting the same contact and deal again...");
  await sleep(8000);
  const { pipelineId, stageIds } = await resolveStageIds(c, PIPELINE_LABEL);
  const again = await upsertContact(c, { phone: "+919000000000", name: "Test Caller" });
  const props = buildDealProperties(payload.deal, stageIds[stageForDecision("qualified")], pipelineId);
  const dealAgain = await upsertDeal(c, { callId, properties: props, contactId: p.contactId });
  console.log(`   contact: ${again.id === p.contactId ? "same record, no duplicate" : "DUPLICATE CREATED"} (created=${again.created})`);
  console.log(`   deal:    ${dealAgain.id === p.dealId ? "same record, no duplicate" : "DUPLICATE CREATED"} (created=${dealAgain.created})`);

  console.log("3) Reading the deal back from HubSpot...");
  const deal = await c.request<{ properties: Record<string, string | null>; associations?: Record<string, { results: { id: string }[] }> }>(
    "GET",
    `/crm/v3/objects/deals/${p.dealId}?properties=dealname,dealstage,pipeline,amount,description,aangan_call_id,aangan_carpet_area_sqft,aangan_property_type,aangan_ready_by,aangan_referral_source&associations=contacts,notes,tasks`,
  );
  const pr = deal.properties;
  const stageKey = Object.entries(stageIds).find(([, id]) => id === pr.dealstage)?.[0];
  console.log("   name:      ", pr.dealname);
  console.log("   stage:     ", stageKey, "(expected new_qualified)");
  console.log("   amount:    ", pr.amount, "(expected 1100000)");
  console.log("   description:", (pr.description ?? "").slice(0, 90));
  console.log("   custom props:", { call_id: pr.aangan_call_id === callId, area: pr.aangan_carpet_area_sqft, type: pr.aangan_property_type, ready_by: pr.aangan_ready_by, referral: pr.aangan_referral_source });
  console.log("   linked contacts:", deal.associations?.contacts?.results.length ?? 0, "| notes:", deal.associations?.notes?.results.length ?? 0, "| tasks:", deal.associations?.tasks?.results.length ?? 0);

  console.log("\nOpen in HubSpot:");
  console.log(`  deal    https://app-na2.hubspot.com/contacts/${portal}/record/0-3/${p.dealId}`);
  console.log(`  contact https://app-na2.hubspot.com/contacts/${portal}/record/0-1/${p.contactId}`);
  console.log("\nThese are FAKE records. Delete the deal and the contact in HubSpot when you have looked.");
}

main().catch((e) => {
  console.error("\nSMOKE TEST FAILED:", String(e instanceof Error ? e.message : e));
  process.exit(1);
});
