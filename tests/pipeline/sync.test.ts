import { describe, it, expect } from "vitest";
import { HubSpotClient } from "@/lib/hubspot/client";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { processCall } from "@/lib/pipeline/process-call";
import { MAX_ATTEMPTS, retryDelayMs, runOutbox } from "@/lib/pipeline/sync";
import { GoldenExtractor } from "@/replay/golden";
import { MockHubSpot } from "@/replay/mock-hubspot";
import { loadPhoneTranscripts } from "@/replay/transcripts";

const calls = Object.fromEntries(loadPhoneTranscripts().map((c) => [c.id, c]));

async function seeded(id: string) {
  const store = new MemoryStore();
  const golden = new GoldenExtractor();
  golden.current = id;
  const c = calls[id];
  await processCall({ store, extractor: golden, now: () => c.startedAt }, { vaaniCallId: `T-${id}`, callerNumber: c.callerNumber, startedAt: c.startedAt, durationSec: c.durationSec, language: "en", callerName: null, transcript: c.transcript });
  const hub = new MockHubSpot();
  const client = new HubSpotClient({ token: "x", fetch: hub.fetch, sleep: async () => {}, maxRetries: 0 });
  return { store, hub, client, now: new Date(c.startedAt.getTime() + 3600_000) };
}

describe("runOutbox", () => {
  it("writes contact, deal, note and tasks to HubSpot and records the ids", async () => {
    const { store, hub, client, now } = await seeded("T07");
    const r = await runOutbox({ store, client, now });
    expect(r).toMatchObject({ processed: 1, done: 1, dead: 0 });
    expect(hub.contacts).toHaveLength(1);
    expect(hub.deals).toHaveLength(1);
    expect(hub.notes).toHaveLength(1);
    expect(hub.tasks).toHaveLength(1);
    expect(hub.stageKeyOf(hub.deals[0].properties.dealstage)).toBe("deferred");
    const lead = [...store.leads.values()][0];
    expect(lead.hubspotDealId).toBe(hub.deals[0].id);
    expect([...store.outbox.values()][0].status).toBe("done");
    expect(store.syncLog.at(-1)).toMatchObject({ ok: true });
  });

  it("a qualified deal carries the estimate amount, labelled; a declined one does not", async () => {
    const q = await seeded("T01");
    await runOutbox({ store: q.store, client: q.client, now: q.now });
    expect(q.hub.deals[0].properties.amount).toBe(1_100_000);
    expect(String(q.hub.deals[0].properties.description)).toContain("ESTIMATE");
    const d = await seeded("T03");
    await runOutbox({ store: d.store, client: d.client, now: d.now });
    expect(d.hub.deals[0].properties).not.toHaveProperty("amount");
    expect(d.hub.stageKeyOf(d.hub.deals[0].properties.dealstage)).toBe("declined_review");
  });

  it("a HubSpot outage never loses the call: the row stays pending with backoff, then succeeds", async () => {
    const { store, hub, client, now } = await seeded("T01");
    hub.failNext = { count: 1000, status: 503 };
    const first = await runOutbox({ store, client, now });
    expect(first).toMatchObject({ retried: 1, done: 0, dead: 0 });
    const row = [...store.outbox.values()][0];
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBe(now.getTime() + retryDelayMs(1));
    // not due yet: nothing happens
    expect((await runOutbox({ store, client, now: new Date(now.getTime() + 1000) })).processed).toBe(0);
    // outage over
    hub.failNext = { count: 0, status: 503 };
    const later = new Date(now.getTime() + retryDelayMs(1) + 1000);
    expect(await runOutbox({ store, client, now: later })).toMatchObject({ done: 1 });
    expect(hub.deals).toHaveLength(1);
  });

  it("a partial failure resumes where it stopped and never duplicates the contact or deal", async () => {
    const { store, hub, client, now } = await seeded("T01");
    // requests: 1 contact search, 2 contact create, 3 pipeline lookup, 4 deal search, 5 deal create, 6 note. Fail the note.
    const realFetch = hub.fetch;
    let n = 0;
    const flaky = new HubSpotClient({ token: "x", maxRetries: 0, sleep: async () => {}, fetch: (async (u: string | URL | Request, i?: RequestInit) => (++n === 6 ? new Response(JSON.stringify({ message: "boom" }), { status: 500 }) : realFetch(u, i))) as typeof fetch });
    const r1 = await runOutbox({ store, client: flaky, now });
    expect(r1.retried).toBe(1);
    expect(hub.deals).toHaveLength(1);
    expect(hub.notes).toHaveLength(0);
    const later = new Date(now.getTime() + retryDelayMs(1) + 1000);
    const r2 = await runOutbox({ store, client, now: later });
    expect(r2.done).toBe(1);
    expect(hub.contacts).toHaveLength(1);
    expect(hub.deals).toHaveLength(1);
    expect(hub.notes).toHaveLength(1);
  });

  it("a permanent error (4xx, e.g. a missing scope) goes straight to dead and is logged, not retried forever", async () => {
    const { store, hub, client, now } = await seeded("T01");
    hub.failNext = { count: 1000, status: 403 };
    const r = await runOutbox({ store, client, now });
    expect(r).toMatchObject({ dead: 1, retried: 0 });
    expect([...store.outbox.values()][0].status).toBe("dead");
    expect(store.syncLog.at(-1)).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it("gives up after the maximum number of attempts", async () => {
    const { store, hub, client, now } = await seeded("T01");
    hub.failNext = { count: 100000, status: 503 };
    let t = now;
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      await runOutbox({ store, client, now: t });
      t = new Date(t.getTime() + 7 * 3600_000);
    }
    const row = [...store.outbox.values()][0];
    expect(row.status).toBe("dead");
    expect(row.attempts).toBe(MAX_ATTEMPTS);
  });

  it("a cancelled (superseded) write is never sent", async () => {
    const { store, hub, client, now } = await seeded("T08");
    const lead = [...store.leads.values()][0];
    await store.supersedeLead(lead.id, "other-call");
    expect(await runOutbox({ store, client, now })).toMatchObject({ processed: 0 });
    expect(hub.deals).toHaveLength(0);
  });

  it("a caller with a hidden number still gets a deal, just no contact", async () => {
    const store = new MemoryStore();
    const golden = new GoldenExtractor();
    golden.current = "T03";
    const c = calls.T03;
    await processCall({ store, extractor: golden, now: () => c.startedAt }, { vaaniCallId: "x", callerNumber: null, startedAt: c.startedAt, durationSec: 100, language: "en", callerName: null, transcript: c.transcript });
    const hub = new MockHubSpot();
    await runOutbox({ store, client: new HubSpotClient({ token: "x", fetch: hub.fetch }), now: new Date(c.startedAt.getTime() + 1000) });
    expect(hub.contacts).toHaveLength(0);
    expect(hub.deals).toHaveLength(1);
  });
});
