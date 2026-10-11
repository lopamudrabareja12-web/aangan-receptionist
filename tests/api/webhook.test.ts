import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handleVaaniWebhook } from "@/lib/pipeline/webhook-handler";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { processReceived, receiveCall } from "@/lib/pipeline/process-call";
import { GoldenExtractor } from "@/replay/golden";
import { parseVaaniPayload, PayloadError } from "@/lib/vaani/adapter";
import { SIGNATURE_HEADER, sign, verifySignature } from "@/lib/vaani/signature";

const SECRET = "test-secret";
const fixture = readFileSync(path.join(__dirname, "../../fixtures/vaani/FAKE-sample-call.json"), "utf8");

const setup = () => {
  const store = new MemoryStore();
  const golden = new GoldenExtractor();
  golden.current = "T01";
  const scheduled: (() => Promise<unknown>)[] = [];
  const order: string[] = [];
  const accept = async (call: Parameters<typeof receiveCall>[1], opts: { rawPayload: unknown }) => {
    const r = await receiveCall(store, call, opts);
    order.push("stored");
    return { callId: r.call.id, duplicate: r.duplicate, process: async () => { order.push("processing"); await processReceived({ store, extractor: golden }, r.call, call); } };
  };
  const post = (body: string, sig: string | null, over: Partial<Parameters<typeof handleVaaniWebhook>[1]> = {}) =>
    handleVaaniWebhook(new Request("http://localhost/api/webhooks/vaani", { method: "POST", body, headers: sig === null ? {} : { [SIGNATURE_HEADER]: sig } }), {
      secret: SECRET, accept, schedule: (w) => void scheduled.push(w), ...over,
    });
  return { store, post, scheduled, order };
};

describe("signature", () => {
  it("accepts a correct signature, with or without the sha256= prefix, and rejects everything else", () => {
    const good = sign("body", SECRET);
    expect(verifySignature("body", good, SECRET)).toBe(true);
    expect(verifySignature("body", `sha256=${good}`, SECRET)).toBe(true);
    expect(verifySignature("body2", good, SECRET)).toBe(false);
    expect(verifySignature("body", good, "other")).toBe(false);
    expect(verifySignature("body", null, SECRET)).toBe(false);
    expect(verifySignature("body", "short", SECRET)).toBe(false);
    expect(verifySignature("body", good, "")).toBe(false);
  });
});

describe("adapter (against the FAKE fixture)", () => {
  it("maps the invented payload to a normalised call", () => {
    const c = parseVaaniPayload(JSON.parse(fixture));
    expect(c).toMatchObject({ vaaniCallId: "FAKE-call-0001", callerNumber: "+919000000001", durationSec: 252 });
    expect(c.transcript.split("\n")[0]).toMatch(/^Agent: Good morning/);
    expect(c.transcript).toContain("Caller: Hi, I'm Priya.");
  });
  it("rejects a payload without a call id or with a bad date", () => {
    expect(() => parseVaaniPayload({})).toThrow(PayloadError);
    expect(() => parseVaaniPayload({ call_id: "x", started_at: "nonsense" })).toThrow(/valid date/);
  });
  it("the fixture announces that it is fake", () => {
    expect(fixture).toMatch(/FAKE PAYLOAD/);
  });
});

describe("POST /api/webhooks/vaani (handler)", () => {
  it("401 for a missing or wrong signature, and nothing is stored or scheduled", async () => {
    const { store, post, scheduled } = setup();
    expect((await post(fixture, null)).status).toBe(401);
    expect((await post(fixture, "deadbeef")).status).toBe(401);
    expect(store.calls.size).toBe(0);
    expect(scheduled).toHaveLength(0);
  });
  it("400 for a signed body that is not JSON or not a call", async () => {
    const { post } = setup();
    expect((await post("not json", sign("not json", SECRET))).status).toBe(400);
    const odd = JSON.stringify({ hello: "world" });
    expect((await post(odd, sign(odd, SECRET))).status).toBe(400);
  });
  it("replies 200 'accepted' BEFORE the slow work runs (Vaani allows only 5 seconds)", async () => {
    const { store, post, scheduled, order } = setup();
    const res = await post(fixture, sign(fixture, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "accepted" });
    expect(order).toEqual(["stored"]); // processing has NOT started when the reply is ready
    expect([...store.calls.values()][0].status).toBe("received"); // but the call is already safely stored
    expect(store.leads.size).toBe(0);
    await scheduled[0]();
    expect(order).toEqual(["stored", "processing"]);
    expect(store.leads.size).toBe(1);
    expect([...store.calls.values()][0].status).toBe("processed");
  });
  it("a second delivery of the same call is a harmless duplicate: nothing more is scheduled", async () => {
    const { store, post, scheduled } = setup();
    await post(fixture, sign(fixture, SECRET));
    await scheduled[0]();
    const second = await post(fixture, sign(fixture, SECRET));
    expect(await second.json()).toMatchObject({ status: "duplicate" });
    expect(scheduled).toHaveLength(1);
    expect(store.leads.size).toBe(1);
  });
  it("500 (so Vaani retries) only when the call could not even be stored", async () => {
    const { post, scheduled } = setup();
    const res = await post(fixture, sign(fixture, SECRET), { accept: async () => { throw new Error("db down, secret detail"); } });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/secret detail|db down/);
    expect(scheduled).toHaveLength(0);
  });
  it("a failure in the background work does not crash anything and leaves the call for the sweeper", async () => {
    const { store, post, scheduled } = setup();
    const boom = { extract: async () => { throw new Error("model down"); } };
    await post(fixture, sign(fixture, SECRET), {
      accept: async (call, opts) => {
        const r = await receiveCall(store, call, opts);
        return { callId: r.call.id, duplicate: false, process: () => processReceived({ store, extractor: boom }, r.call, call) };
      },
    });
    await expect(scheduled[0]()).resolves.toBeUndefined(); // the wrapper swallows and logs, never throws
    expect([...store.calls.values()][0].status).toBe("failed");
  });
});
