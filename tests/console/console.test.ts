import { describe, expect, it } from "vitest";
import { breakEven, summariseCosts } from "@/lib/console/costs";
import { reinstateLead } from "@/lib/console/reinstate";
import { checkPassword, sessionToken, verifySession } from "@/lib/console/session";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { runOutbox } from "@/lib/pipeline/sync";
import { HubSpotClient } from "@/lib/hubspot/client";
import { MockHubSpot } from "@/replay/mock-hubspot";
import type { NewLead } from "@/lib/pipeline/store";

describe("console session", () => {
  it("accepts the token for the right password only", () => {
    const t = sessionToken("correct horse");
    expect(verifySession("correct horse", t)).toBe(true);
    expect(verifySession("other", t)).toBe(false);
    expect(verifySession("correct horse", "x".repeat(64))).toBe(false);
  });
  it("fails closed when no password is configured or no cookie is sent", () => {
    expect(verifySession(undefined, sessionToken("p"))).toBe(false);
    expect(verifySession("p", undefined)).toBe(false);
    expect(checkPassword(undefined, "anything")).toBe(false);
    expect(checkPassword("p", "")).toBe(false);
  });
  it("checks a typed password", () => {
    expect(checkPassword("secret-123", "secret-123")).toBe(true);
    expect(checkPassword("secret-123", "secret-124")).toBe(false);
    expect(checkPassword("secret-123", "secret-12")).toBe(false);
  });
});

describe("cost summary and break-even", () => {
  it("totals per call and per qualified lead", () => {
    const s = summariseCosts([{ voiceMinutes: 4, voiceCost: 22, llmCost: 0.5 }, { voiceMinutes: 2, voiceCost: 11, llmCost: 0.3 }], 1);
    expect(s.total).toBeCloseTo(33.8);
    expect(s.perCall).toBeCloseTo(16.9);
    expect(s.perQualifiedLead).toBeCloseTo(33.8);
  });
  it("has no per-lead figure when nothing qualified", () => {
    expect(summariseCosts([], 0)).toMatchObject({ calls: 0, perCall: 0, perQualifiedLead: null });
  });
  it("works out how many extra projects pay for the year", () => {
    const b = breakEven({ callsPerMonth: 100, avgVoiceMinutes: 5, avgLlmCostPerCall: 1, voiceRatePerMin: 5.5, resendMonthly: 500, hostingMonthly: 1000, avgProjectValue: 1_100_000, conversionRate: 0.1 });
    expect(b.monthlyCost).toBeCloseTo(100 * (27.5 + 1) + 1500);
    expect(b.extraProjectsPerYear).toBeCloseTo((b.monthlyCost * 12) / 1_100_000);
    expect(b.extraLeadsPerYear).toBeCloseTo(b.extraProjectsPerYear / 0.1);
  });
  it("gives no lead count when the conversion rate is zero", () => {
    expect(breakEven({ callsPerMonth: 1, avgVoiceMinutes: 1, avgLlmCostPerCall: 0, voiceRatePerMin: 5, resendMonthly: 0, hostingMonthly: 0, avgProjectValue: 1e6, conversionRate: 0 }).extraLeadsPerYear).toBeNull();
  });
});

const declinedLead = (callId: string): NewLead => ({
  callId, name: "Asha Rao", phone: "+919800000000", extraction: null, summary: null, priceAsked: false, rubricVersion: "t",
  rubric: { decision: "declined", reasonCode: "out_of_area", detail: "Outside Pune and PCMC", flags: [], missingFields: [], revisitOn: null },
});

async function seed() {
  const store = new MemoryStore();
  const { call } = await store.insertCall({ vaaniCallId: "v1", callerNumber: "+919800000000", startedAt: new Date("2026-10-12T06:00:00Z"), durationSec: 120, language: "en", transcript: "x", rawPayload: null, isHistorical: false });
  const lead = await store.saveLead(declinedLead(call.id), { voiceMinutes: 2, voiceCostInr: 11, llmInputTokens: 0, llmOutputTokens: 0, llmCostInr: 0 });
  return { store, lead };
}

describe("reinstate a declined lead", () => {
  const now = new Date("2026-10-12T06:30:00Z"); // 12:00 IST, inside working hours

  it("waits until the lead has a HubSpot deal", async () => {
    const { store, lead } = await seed();
    expect((await reinstateLead({ store, now, avgProjectValueInr: 1_100_000 }, lead.id)).status).toBe("not_synced");
    expect((await store.getLeadForReinstate(lead.id))?.decision).toBe("declined");
  });

  it("flips the decision once, queues the stage move and opens a claim", async () => {
    const { store, lead } = await seed();
    await store.setLeadHubspotIds(lead.id, { contactId: null, dealId: "D1" });
    const r = await reinstateLead({ store, now, avgProjectValueInr: 1_100_000 }, lead.id);
    expect(r.status).toBe("reinstated");
    const after = await store.getLeadForReinstate(lead.id);
    expect(after?.decision).toBe("qualified_flagged");
    expect(after?.flags).toContain("reinstated");
    expect([...store.outbox.values()].filter((o) => o.operation === "reinstate_deal")).toHaveLength(1);
    const a = await store.getAssignment(lead.id);
    expect(a?.kind).toBe("claim");
    expect(a?.subject).toContain("reinstated");
    expect(store.events.some((e) => e.eventType === "reinstated")).toBe(true);
  });

  it("does nothing the second time", async () => {
    const { store, lead } = await seed();
    await store.setLeadHubspotIds(lead.id, { contactId: null, dealId: "D1" });
    await reinstateLead({ store, now, avgProjectValueInr: 1_100_000 }, lead.id);
    expect((await reinstateLead({ store, now, avgProjectValueInr: 1_100_000 }, lead.id)).status).toBe("not_declined");
    expect([...store.outbox.values()].filter((o) => o.operation === "reinstate_deal")).toHaveLength(1);
  });

  it("reports an unknown lead", async () => {
    const { store } = await seed();
    expect((await reinstateLead({ store, now, avgProjectValueInr: 1 }, "nope")).status).toBe("not_found");
  });

  it("moves the HubSpot deal back to New (qualified) with an estimate when the outbox runs", async () => {
    const { store, lead } = await seed();
    const mock = new MockHubSpot();
    const client = new HubSpotClient({ token: "mock", fetch: mock.fetch, sleep: async () => {} });
    // sync the declined lead first so a real (mock) deal exists
    const dealRes = await client.request<{ id: string }>("POST", "/crm/v3/objects/deals", { properties: { dealname: "Asha", dealstage: mock.stageId("declined_review") } });
    await store.setLeadHubspotIds(lead.id, { contactId: null, dealId: dealRes.id });
    await reinstateLead({ store, now, avgProjectValueInr: 1_100_000 }, lead.id);
    const summary = await runOutbox({ store, client, now });
    expect(summary.dead).toBe(0);
    expect(store.events.some((e) => e.eventType === "hubspot_reinstated")).toBe(true);
    const deal = mock.deals.find((d) => d.id === dealRes.id)!;
    expect(mock.stageKeyOf(deal.properties.dealstage)).toBe("new_qualified");
    expect(deal.properties.amount).toBe(1_100_000);
    expect(mock.notes).toHaveLength(1);
  });
});
