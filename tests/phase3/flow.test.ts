import { describe, it, expect } from "vitest";
import { claimByLink } from "@/lib/pipeline/claim";
import { runAutoAssign, runNotifications, pickDesigner } from "@/lib/pipeline/notify";
import { enqueueClaim } from "@/lib/pipeline/claim";
import { countOpenDeals, resolveStageIds } from "@/lib/hubspot/crm";
import { PIPELINE_LABEL } from "@/lib/hubspot/stages";
import { BASE, NIKHIL, SECRET, calls, claimLinkFrom, designer, ingest, makeWorld, min, syncToHubSpot } from "./world";

type World = ReturnType<typeof makeWorld>;
const T01 = calls.T01.startedAt; // 2 Sep 2026, 10:23 IST (inside opening hours)
const notifyDeps = (w: World, now: Date) => ({ store: w.store, mailer: w.mailer, now, baseUrl: BASE, secret: SECRET, nikhilEmail: NIKHIL, timeoutMinutes: 15 });

/** A qualified lead that has been synced to HubSpot and is ready to email. */
async function readyLead(w: World, id = "T01", startedAt?: Date) {
  const leadId = await ingest(w.store, id, startedAt ? { startedAt } : {});
  await syncToHubSpot(w, new Date((startedAt ?? calls[id].startedAt).getTime() + min(1)));
  return leadId;
}

describe("notifying designers", () => {
  it("emails every on-duty designer who is linked to HubSpot (not the placeholder), each with their own claim link", async () => {
    const w = makeWorld();
    const leadId = await readyLead(w);
    const r = await runNotifications(notifyDeps(w, new Date(T01.getTime() + min(2))));
    expect(r).toMatchObject({ designerEmails: 2, notified: 1 });
    expect(w.mailer.to("asha@example.test")).toHaveLength(1);
    expect(w.mailer.to("bala@example.test")).toHaveLength(1);
    expect(w.mailer.to("placeholder@example.test")).toHaveLength(0);
    const la = claimLinkFrom(w.mailer.to("asha@example.test")[0]);
    const lb = claimLinkFrom(w.mailer.to("bala@example.test")[0]);
    expect(la.leadId).toBe(leadId);
    expect(la.designerId).toBe("dA");
    expect(la.token).not.toBe(lb.token);
    const a = await w.store.getAssignment(leadId);
    expect(a?.status).toBe("notified");
    expect(a?.claimDeadline?.getTime()).toBe(T01.getTime() + min(2) + min(15));
  });

  it("the email carries the full handoff note (so the designer does not re-ask) and no price", async () => {
    const w = makeWorld();
    await readyLead(w);
    await runNotifications(notifyDeps(w, new Date(T01.getTime() + min(2))));
    const m = w.mailer.to("asha@example.test")[0];
    expect(m.text).toContain("Kothrud");
    expect(m.text).toContain("1,400 sq ft");
    expect(m.text).toContain("Timeline:");
    expect(m.text + m.html).not.toMatch(/per sq ?ft/i);
  });

  it("is safe to run every minute: nobody is emailed twice", async () => {
    const w = makeWorld();
    await readyLead(w);
    const now = new Date(T01.getTime() + min(2));
    await runNotifications(notifyDeps(w, now));
    await runNotifications(notifyDeps(w, new Date(now.getTime() + min(1))));
    await runNotifications(notifyDeps(w, new Date(now.getTime() + min(2))));
    expect(w.mailer.sent).toHaveLength(2);
  });

  it("waits until the lead has reached HubSpot", async () => {
    const w = makeWorld();
    await ingest(w.store, "T01"); // not synced yet: no deal, so nothing to claim
    expect(await runNotifications(notifyDeps(w, new Date(T01.getTime() + min(2))))).toMatchObject({ designerEmails: 0, notified: 0 });
    expect(w.mailer.sent).toHaveLength(0);
  });

  it("an after-hours lead is queued and emailed at 10:00 IST", async () => {
    const w = makeWorld();
    const night = new Date("2026-09-02T17:30:00Z"); // 23:00 IST
    await readyLead(w, "T01", night);
    expect(await runNotifications(notifyDeps(w, new Date(night.getTime() + min(30))))).toMatchObject({ designerEmails: 0 });
    const tenAm = new Date("2026-09-03T04:30:00Z"); // 10:00 IST next day
    expect(await runNotifications(notifyDeps(w, tenAm))).toMatchObject({ designerEmails: 2, notified: 1 });
    const a = await w.store.getAssignment((await w.store.listDueNotifications(tenAm))[0]?.leadId ?? [...w.store.assignments.keys()][0]);
    expect(a?.claimDeadline?.getTime()).toBe(tenAm.getTime() + min(15)); // the 15-minute clock starts at 10:00, not at midnight
  });

  it("if one email fails, the others still go, the claim clock waits, and the retry only sends the missing one", async () => {
    const w = makeWorld();
    const leadId = await readyLead(w);
    const now = new Date(T01.getTime() + min(2));
    w.mailer.failFor.add("bala@example.test");
    const first = await runNotifications(notifyDeps(w, now));
    expect(first.designerEmails).toBe(1);
    expect(first.errors[0]).toContain("bala@example.test");
    expect((await w.store.getAssignment(leadId))?.status).toBe("awaiting_notify");
    w.mailer.failFor.clear();
    const second = await runNotifications(notifyDeps(w, new Date(now.getTime() + min(1))));
    expect(second.designerEmails).toBe(1);
    expect(w.mailer.to("asha@example.test")).toHaveLength(1);
    expect(w.mailer.to("bala@example.test")).toHaveLength(1);
    expect((await w.store.getAssignment(leadId))?.status).toBe("notified");
  });

  it("no designer on duty: Nikhil is told once, the lead keeps waiting", async () => {
    const w = makeWorld({ designers: [designer("dA", "Asha", "101", false)] });
    const leadId = await readyLead(w);
    const now = new Date(T01.getTime() + min(2));
    await runNotifications(notifyDeps(w, now));
    await runNotifications(notifyDeps(w, new Date(now.getTime() + min(1))));
    expect(w.mailer.sent).toHaveLength(1);
    expect(w.mailer.sent[0].to).toBe(NIKHIL);
    expect(w.mailer.sent[0].subject).toMatch(/No designer on duty/);
    expect((await w.store.getAssignment(leadId))?.status).toBe("awaiting_notify");
  });

  it("a VIP lead also emails Nikhil, once", async () => {
    const w = makeWorld();
    await readyLead(w, "T05");
    const now = new Date(calls.T05.startedAt.getTime() + min(2));
    await runNotifications(notifyDeps(w, now));
    await runNotifications(notifyDeps(w, new Date(now.getTime() + min(1))));
    expect(w.mailer.to(NIKHIL)).toHaveLength(1);
    expect(w.mailer.to(NIKHIL)[0].subject).toMatch(/^VIP enquiry/);
  });

  it("a complaint goes straight to Nikhil, needs no HubSpot deal, and never to designers", async () => {
    const w = makeWorld();
    await ingest(w.store, "T09"); // not even synced
    await runNotifications(notifyDeps(w, new Date(calls.T09.startedAt.getTime() + min(1))));
    expect(w.mailer.sent).toHaveLength(1);
    expect(w.mailer.sent[0].to).toBe(NIKHIL);
    expect(w.mailer.sent[0].subject).toMatch(/^ESCALATION/);
    await runNotifications(notifyDeps(w, new Date(calls.T09.startedAt.getTime() + min(5))));
    expect(w.mailer.sent).toHaveLength(1);
  });

  it("declined, deferred and incomplete leads email nobody", async () => {
    const w = makeWorld();
    for (const id of ["T03", "T07", "T08"]) await ingest(w.store, id);
    expect(w.store.assignments.size).toBe(0);
  });
});

describe("claiming (first claim wins)", () => {
  async function notified() {
    const w = makeWorld();
    const leadId = await readyLead(w);
    const now = new Date(T01.getTime() + min(2));
    await runNotifications(notifyDeps(w, now));
    const a = claimLinkFrom(w.mailer.to("asha@example.test")[0]);
    const b = claimLinkFrom(w.mailer.to("bala@example.test")[0]);
    const deps = { store: w.store, secret: SECRET, now: new Date(now.getTime() + min(3)) };
    return { w, leadId, a, b, deps };
  }

  it("a designer's claim sets the HubSpot deal owner, moves New to Claimed, and leaves a note", async () => {
    const { w, leadId, a, deps } = await notified();
    expect(await claimByLink(deps, a.leadId, a.designerId, a.token)).toEqual({ status: "claimed", designerName: "Asha" });
    await syncToHubSpot(w, new Date(deps.now.getTime() + min(1)));
    const deal = w.hub.deals[0];
    expect(deal.properties.hubspot_owner_id).toBe("101");
    expect(w.hub.stageKeyOf(deal.properties.dealstage)).toBe("claimed");
    expect(w.hub.notes.some((n) => String(n.properties.hs_note_body).includes("Asha owns this lead"))).toBe(true);
    expect((await w.store.getAssignment(leadId))?.status).toBe("claimed");
  });

  it("the second designer finds it taken, by name", async () => {
    const { a, b, deps } = await notified();
    await claimByLink(deps, a.leadId, a.designerId, a.token);
    expect(await claimByLink(deps, b.leadId, b.designerId, b.token)).toEqual({ status: "taken", byName: "Asha" });
  });

  it("two designers pressing at the same instant: exactly one wins", async () => {
    const { w, a, b, deps } = await notified();
    const results = await Promise.all([claimByLink(deps, a.leadId, a.designerId, a.token), claimByLink(deps, b.leadId, b.designerId, b.token)]);
    expect(results.filter((r) => r.status === "claimed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "taken")).toHaveLength(1);
    expect([...w.store.outbox.values()].filter((r) => r.operation === "claim_deal")).toHaveLength(1);
  });

  it("pressing the button again is harmless and never queues a second HubSpot write", async () => {
    const { w, a, deps } = await notified();
    await claimByLink(deps, a.leadId, a.designerId, a.token);
    expect(await claimByLink(deps, a.leadId, a.designerId, a.token)).toEqual({ status: "already_yours", designerName: "Asha" });
    expect([...w.store.outbox.values()].filter((r) => r.operation === "claim_deal")).toHaveLength(1);
  });

  it("a wrong, edited or borrowed link claims nothing", async () => {
    const { w, a, b, deps } = await notified();
    expect(await claimByLink(deps, a.leadId, a.designerId, "forged")).toEqual({ status: "invalid" });
    expect(await claimByLink(deps, a.leadId, b.designerId, a.token)).toEqual({ status: "invalid" }); // Asha's token with Bala's id
    expect(await claimByLink(deps, "no-such-lead", a.designerId, a.token)).toEqual({ status: "invalid" });
    expect(await claimByLink({ ...deps, secret: "another-secret-another-secret" }, a.leadId, a.designerId, a.token)).toEqual({ status: "invalid" });
    expect((await w.store.getAssignment(a.leadId))?.status).toBe("notified");
  });

  it("a designer who is not linked to a HubSpot user cannot claim", async () => {
    const w = makeWorld({ designers: [designer("dA", "Asha", "101"), designer("dX", "Xavier", null)] });
    const leadId = await readyLead(w);
    const deps = { store: w.store, secret: SECRET, now: new Date(T01.getTime() + min(3)) };
    const { makeClaimToken } = await import("@/lib/claim-token");
    expect(await claimByLink(deps, leadId, "dX", makeClaimToken(SECRET, leadId, "dX"))).toEqual({ status: "not_ready" });
  });

  it("if a designer already moved the deal on, the claim sets the owner but never drags the stage back", async () => {
    const { w, a, deps } = await notified();
    await claimByLink(deps, a.leadId, a.designerId, a.token);
    w.hub.deals[0].properties.dealstage = w.hub.stageId("site_visit_scheduled");
    await syncToHubSpot(w, new Date(deps.now.getTime() + min(1)));
    expect(w.hub.deals[0].properties.hubspot_owner_id).toBe("101");
    expect(w.hub.stageKeyOf(w.hub.deals[0].properties.dealstage)).toBe("site_visit_scheduled");
  });

  it("a HubSpot outage during a claim leaves it queued and it completes later, once", async () => {
    const { w, a, deps } = await notified();
    await claimByLink(deps, a.leadId, a.designerId, a.token);
    w.hub.failNext = { count: 1000, status: 503 };
    const t1 = new Date(deps.now.getTime() + min(1));
    expect(await syncToHubSpot(w, t1)).toMatchObject({ retried: 1, done: 0 });
    w.hub.failNext = { count: 0, status: 503 };
    const t2 = new Date(t1.getTime() + min(60));
    expect(await syncToHubSpot(w, t2)).toMatchObject({ done: 1 });
    expect(w.hub.deals[0].properties.hubspot_owner_id).toBe("101");
    expect(w.hub.notes.filter((n) => String(n.properties.hs_note_body).includes("owns this lead"))).toHaveLength(1);
  });
});

describe("auto-assign after the claim window", () => {
  async function overdue(openDealsFor: Record<string, number> = {}) {
    const w = makeWorld();
    const leadId = await readyLead(w);
    const notifiedAt = new Date(T01.getTime() + min(2));
    await runNotifications(notifyDeps(w, notifiedAt));
    w.mailer.sent.length = 0;
    const openDeals = async (owner: string) => openDealsFor[owner] ?? 0;
    const enqueue = (a: Parameters<typeof enqueueClaim>[1], d: Parameters<typeof enqueueClaim>[2]) => enqueueClaim(w.store, a, d, "auto", new Date(notifiedAt.getTime() + min(16)));
    return { w, leadId, notifiedAt, openDeals, enqueue };
  }

  it("nothing happens before the deadline", async () => {
    const { w, notifiedAt, openDeals, enqueue } = await overdue();
    const r = await runAutoAssign({ ...notifyDeps(w, new Date(notifiedAt.getTime() + min(14))), openDeals }, enqueue);
    expect(r.assigned).toBe(0);
  });

  it("after 15 minutes it assigns the designer with the FEWEST open deals, queues the HubSpot owner write, and tells the designer and Nikhil", async () => {
    const { w, leadId, notifiedAt, openDeals, enqueue } = await overdue({ "101": 3, "102": 1 });
    const r = await runAutoAssign({ ...notifyDeps(w, new Date(notifiedAt.getTime() + min(16))), openDeals }, enqueue);
    expect(r.assigned).toBe(1);
    const a = await w.store.getAssignment(leadId);
    expect(a).toMatchObject({ status: "auto_assigned", designerId: "dB", via: "auto" });
    expect(w.mailer.to("bala@example.test")[0].subject).toMatch(/^Assigned to you/);
    expect(w.mailer.to(NIKHIL)[0].subject).toMatch(/^Unclaimed lead was auto-assigned/);
    await syncToHubSpot(w, new Date(notifiedAt.getTime() + min(17)));
    expect(w.hub.deals[0].properties.hubspot_owner_id).toBe("102");
    expect(w.hub.stageKeyOf(w.hub.deals[0].properties.dealstage)).toBe("claimed");
  });

  it("ties are broken at random", async () => {
    const cands = [designer("dA", "Asha", "101"), designer("dB", "Bala", "102")];
    const eq = async () => 2;
    expect((await pickDesigner(cands, eq, () => 0)).id).toBe("dA");
    expect((await pickDesigner(cands, eq, () => 0.99)).id).toBe("dB");
  });

  it("if HubSpot cannot be asked for counts, it still assigns somebody", async () => {
    const cands = [designer("dA", "Asha", "101"), designer("dB", "Bala", "102")];
    const down = async () => { throw new Error("HubSpot down"); };
    expect(["dA", "dB"]).toContain((await pickDesigner(cands, down, () => 0.4)).id);
    const partial = async (o: string) => { if (o === "101") throw new Error("x"); return 5; };
    expect((await pickDesigner(cands, partial)).id).toBe("dB"); // the one it could count wins over the unknown one
  });

  it("a lead claimed in the meantime is never auto-assigned over", async () => {
    const { w, leadId, notifiedAt, openDeals, enqueue } = await overdue();
    await w.store.claimLead(leadId, "dA", "claim", new Date(notifiedAt.getTime() + min(14)));
    const r = await runAutoAssign({ ...notifyDeps(w, new Date(notifiedAt.getTime() + min(16))), openDeals }, enqueue);
    expect(r.assigned).toBe(0);
    expect((await w.store.getAssignment(leadId))?.designerId).toBe("dA");
  });

  it("assigning twice is impossible: a second run finds nothing", async () => {
    const { w, notifiedAt, openDeals, enqueue } = await overdue();
    const later = new Date(notifiedAt.getTime() + min(16));
    await runAutoAssign({ ...notifyDeps(w, later), openDeals }, enqueue);
    const again = await runAutoAssign({ ...notifyDeps(w, new Date(later.getTime() + min(1))), openDeals }, enqueue);
    expect(again.assigned).toBe(0);
  });

  it("the 15 minutes are WORKING minutes: notified at 18:55 IST, not overdue at 19:10 but overdue at 10:10 next day", async () => {
    const w = makeWorld();
    const evening = new Date("2026-09-02T13:20:00Z"); // 18:50 IST
    const leadId = await readyLead(w, "T01", evening);
    const sent = new Date("2026-09-02T13:25:00Z"); // 18:55 IST
    await runNotifications(notifyDeps(w, sent));
    const openDeals = async () => 0;
    const enqueue = (a: Parameters<typeof enqueueClaim>[1], d: Parameters<typeof enqueueClaim>[2]) => enqueueClaim(w.store, a, d, "auto", new Date());
    expect((await runAutoAssign({ ...notifyDeps(w, new Date("2026-09-02T13:40:00Z")), openDeals }, enqueue)).assigned).toBe(0); // 19:10 IST
    expect((await runAutoAssign({ ...notifyDeps(w, new Date("2026-09-03T04:41:00Z")), openDeals }, enqueue)).assigned).toBe(1); // 10:11 IST
    expect((await w.store.getAssignment(leadId))?.status).toBe("auto_assigned");
  });
});

describe("open-deal counting in HubSpot", () => {
  it("counts only OPEN deals of that owner in the Aangan pipeline", async () => {
    const w = makeWorld();
    for (const id of ["T01", "T02", "T06"]) await readyLead(w, id);
    const { pipelineId } = await resolveStageIds(w.client, PIPELINE_LABEL);
    w.hub.deals[0].properties.hubspot_owner_id = "101";
    w.hub.deals[1].properties.hubspot_owner_id = "101";
    w.hub.deals[2].properties.hubspot_owner_id = "101";
    expect(await countOpenDeals(w.client, "101", pipelineId)).toBe(3);
    w.hub.deals[2].properties.dealstage = w.hub.stageId("won"); // closed
    expect(await countOpenDeals(w.client, "101", pipelineId)).toBe(2);
    expect(await countOpenDeals(w.client, "102", pipelineId)).toBe(0);
  });
});
