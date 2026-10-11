import { describe, it, expect } from "vitest";
import { callFromRecord, processReceived, receiveCall } from "@/lib/pipeline/process-call";
import { sweepStaleCalls } from "@/lib/pipeline/sweep";
import { runTick } from "@/lib/pipeline/tick";
import type { Extractor } from "@/lib/pipeline/extractor";
import { GoldenExtractor } from "@/replay/golden";
import { BASE, NIKHIL, SECRET, calls, claimLinkFrom, ingest, makeWorld, min } from "./world";
import { claimByLink } from "@/lib/pipeline/claim";

const normalized = (id: string) => ({ vaaniCallId: `T-${id}`, callerNumber: calls[id].callerNumber, startedAt: calls[id].startedAt, durationSec: calls[id].durationSec, language: "en", callerName: null, transcript: calls[id].transcript });

describe("sweeping stored-but-unfinished calls", () => {
  const golden = (id: string) => { const g = new GoldenExtractor(); g.current = id; return g; };

  it("finishes a call that was stored but never processed, and leaves recent or finished ones alone", async () => {
    const w = makeWorld();
    const stuck = await receiveCall(w.store, normalized("T01"));
    const fresh = await receiveCall(w.store, normalized("T02"));
    const t = calls.T01.startedAt;
    // T02 'arrived' 1 minute before the sweep, T01 an hour before
    w.store.calls.get(fresh.call.id)!.startedAt = new Date(t.getTime() + min(59));
    const sweepAt = new Date(t.getTime() + min(60));
    const g = golden("T01");
    const extractor: Extractor = { extract: () => g.extract() };
    const r = await sweepStaleCalls({ store: w.store, extractor, now: () => sweepAt }, sweepAt);
    expect(r).toEqual({ retried: 1, failed: 0 });
    expect(w.store.calls.get(stuck.call.id)?.status).toBe("processed");
    expect(w.store.calls.get(fresh.call.id)?.status).toBe("received");
    expect((await sweepStaleCalls({ store: w.store, extractor, now: () => sweepAt }, sweepAt)).retried).toBe(0); // nothing left
  });

  it("retries a call whose AI step failed earlier", async () => {
    const w = makeWorld();
    const rec = await receiveCall(w.store, normalized("T01"));
    await expect(processReceived({ store: w.store, extractor: { extract: async () => { throw new Error("model down"); } } }, rec.call, normalized("T01"))).rejects.toThrow();
    expect(w.store.calls.get(rec.call.id)?.status).toBe("failed");
    const at = new Date(calls.T01.startedAt.getTime() + min(30));
    const r = await sweepStaleCalls({ store: w.store, extractor: golden("T01"), now: () => at }, at);
    expect(r.retried).toBe(1);
    expect(w.store.calls.get(rec.call.id)?.status).toBe("processed");
    expect(w.store.leads.size).toBe(1);
  });

  it("rebuilds the call from storage, using the platform's caller name when the payload had one", () => {
    const rec = { id: "1", vaaniCallId: "v", callerNumber: "+91900", startedAt: new Date(), durationSec: 60, language: "en", transcript: "Caller: hi", rawPayload: { call_id: "v", started_at: "2026-09-02T04:53:00Z", caller_name: "Priya Shah" }, isHistorical: false, status: "received" as const };
    expect(callFromRecord(rec).callerName).toBe("Priya Shah");
    expect(callFromRecord({ ...rec, rawPayload: { weird: true } }).callerName).toBeNull();
  });
});

describe("the every-minute job (runTick)", () => {
  it("runs the whole chain: sync to HubSpot, email designers, a claim, and the owner appears in HubSpot", async () => {
    const w = makeWorld();
    await ingest(w.store, "T01");
    const base = { store: w.store, baseUrl: BASE, claimSecret: SECRET, nikhilEmail: NIKHIL, hubspot: w.client, mailer: w.mailer };
    const t1 = new Date(calls.T01.startedAt.getTime() + min(1));
    const r1 = await runTick({ ...base, now: t1 });
    expect(r1.errors).toEqual([]);
    expect(w.hub.deals).toHaveLength(1);
    // emails go out on the next pass because the deal now exists
    const t2 = new Date(t1.getTime() + min(1));
    await runTick({ ...base, now: t2 });
    expect(w.mailer.to("asha@example.test")).toHaveLength(1);
    const link = claimLinkFrom(w.mailer.to("asha@example.test")[0]);
    expect((await claimByLink({ store: w.store, secret: SECRET, now: new Date(t2.getTime() + min(1)) }, link.leadId, link.designerId, link.token)).status).toBe("claimed");
    await runTick({ ...base, now: new Date(t2.getTime() + min(2)) });
    expect(w.hub.deals[0].properties.hubspot_owner_id).toBe("101");
  });

  it("auto-assigns after the window and pushes the owner to HubSpot in the same pass", async () => {
    const w = makeWorld();
    await ingest(w.store, "T01");
    const base = { store: w.store, baseUrl: BASE, claimSecret: SECRET, nikhilEmail: NIKHIL, hubspot: w.client, mailer: w.mailer, rng: () => 0 };
    const t1 = new Date(calls.T01.startedAt.getTime() + min(1));
    await runTick({ ...base, now: t1 });
    await runTick({ ...base, now: new Date(t1.getTime() + min(1)) }); // emails sent here; clock starts
    const late = new Date(t1.getTime() + min(1) + min(16));
    const r = await runTick({ ...base, now: late });
    expect(r.errors).toEqual([]);
    expect((r.assign as { assigned: number }).assigned).toBe(1);
    expect(w.hub.deals[0].properties.hubspot_owner_id).toBeTruthy();
  });

  it("a missing service skips only its own step and says so; the others still run", async () => {
    const w = makeWorld();
    await ingest(w.store, "T01");
    const r = await runTick({ store: w.store, baseUrl: BASE, claimSecret: SECRET, hubspot: w.client, now: new Date(calls.T01.startedAt.getTime() + min(1)) }); // no mailer, no extractor
    expect(w.hub.deals).toHaveLength(1); // HubSpot sync still ran
    expect(r.skipped).toEqual(expect.arrayContaining([expect.stringContaining("emails"), expect.stringContaining("sweep")]));
    expect(r.errors).toEqual([]);
  });

  it("one failing step does not stop the others", async () => {
    const w = makeWorld();
    await ingest(w.store, "T09"); // complaint: needs only email
    w.hub.failNext = { count: 1000, status: 403 }; // HubSpot rejects everything
    const r = await runTick({ store: w.store, baseUrl: BASE, claimSecret: SECRET, nikhilEmail: NIKHIL, hubspot: w.client, mailer: w.mailer, now: new Date(calls.T09.startedAt.getTime() + min(1)) });
    expect(w.mailer.to(NIKHIL)).toHaveLength(1); // the complaint alert still went out
    expect((r.errors as string[]).length + (((r.outbox as { dead: number } | undefined)?.dead) ?? 0)).toBeGreaterThan(0);
  });
});
