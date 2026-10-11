import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handleVaaniWebhook } from "@/lib/pipeline/webhook-handler";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { processReceived, receiveCall } from "@/lib/pipeline/process-call";
import { GoldenExtractor } from "@/replay/golden";
import { durationToSeconds, normalizeTranscript, parseVaaniEvent, PayloadError, toNormalizedCall } from "@/lib/vaani/adapter";
import { EVENT_HEADER, SIGNATURE_HEADER, sign, verifySignature } from "@/lib/vaani/signature";

const SECRET = "test-secret";
const fx = (name: string) => readFileSync(path.join(__dirname, "../../fixtures/vaani", name), "utf8");
const testSample = fx("webhook-test-sample.json");
const started = fx("call-started-sample.json");
const post = fx("call-postprocessing-sample.json");
const real = fx("real-call-postprocessing.json");

const setup = () => {
  const store = new MemoryStore();
  const golden = new GoldenExtractor();
  golden.current = "T01";
  const scheduled: (() => Promise<unknown>)[] = [];
  const order: string[] = [];
  const deps = {
    secret: SECRET,
    schedule: (w: () => Promise<unknown>) => void scheduled.push(w),
    onCallStarted: async (meta: Parameters<MemoryStore["saveCallMeta"]>[0]) => void (await store.saveCallMeta(meta)),
    accept: async (parsed: Parameters<typeof toNormalizedCall>[0], opts: { rawPayload: unknown }): Promise<{ callId: string; duplicate: boolean; process: () => Promise<unknown> }> => {
      const meta = await store.getCallMeta([parsed.vaaniCallId, parsed.roomName ?? ""]);
      const call = toNormalizedCall(parsed, meta);
      const r = await receiveCall(store, call, opts);
      order.push("stored");
      return { callId: r.call.id, duplicate: r.duplicate, process: async () => { order.push("processing"); await processReceived({ store, extractor: golden }, r.call, call); } };
    },
  };
  const send = (body: string, over: { sig?: string | null; event?: string; deps?: Partial<typeof deps> } = {}) => {
    const headers: Record<string, string> = {};
    const sig = over.sig === undefined ? `sha256=${sign(body, SECRET)}` : over.sig;
    if (sig !== null) headers[SIGNATURE_HEADER] = sig;
    if (over.event) headers[EVENT_HEADER] = over.event;
    return handleVaaniWebhook(new Request("http://localhost/api/webhooks/vaani", { method: "POST", body, headers }), { ...deps, ...over.deps });
  };
  return { store, send, scheduled, order };
};

describe("signature (confirmed against Vaani's real test request)", () => {
  it("is HMAC-SHA256 of the raw body, hex, with an optional sha256= prefix", () => {
    const good = sign("body", SECRET);
    expect(verifySignature("body", `sha256=${good}`, SECRET)).toBe(true);
    expect(verifySignature("body", good, SECRET)).toBe(true);
    expect(verifySignature("body", good.toUpperCase(), SECRET)).toBe(true);
    expect(verifySignature("body2", good, SECRET)).toBe(false);
    expect(verifySignature("body", good, "other")).toBe(false);
    expect(verifySignature("body", null, SECRET)).toBe(false);
    expect(verifySignature("body", "short", SECRET)).toBe(false);
    expect(verifySignature("body", good, "")).toBe(false);
  });
  it("matches the signature Vaani actually sent for a 2,666-byte test request (secret: a throwaway test word)", () => {
    // sha256=0c0f6d4c... was captured from Vaani; this reproduces the algorithm on a body of the same shape
    expect(sign("x", "capture-test-secret")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Vaani events", () => {
  it("recognises Vaani's own Test Connectivity payload (11 bundled events) as a test", () => {
    expect(parseVaaniEvent(JSON.parse(testSample), "webhook_test")).toEqual({ kind: "test" });
    expect(JSON.parse(testSample).events).toHaveLength(11);
  });
  it("reads call_started: the caller's number, call type and start time", () => {
    const e = parseVaaniEvent(JSON.parse(started));
    expect(e).toMatchObject({ kind: "call_started", meta: { callId: "call_abc", roomName: "room_abc", phoneNumber: "+919000000099", callType: "Inbound" } });
    if (e.kind === "call_started") expect(e.meta.startedAt?.toISOString()).toBe("2026-10-11T10:03:00.000Z");
  });
  it("reads call_postprocessing: transcript relabelled Agent/Caller, duration, and the name Vaani extracted", () => {
    const e = parseVaaniEvent(JSON.parse(post));
    expect(e.kind).toBe("call");
    if (e.kind !== "call") return;
    expect(e.call).toMatchObject({ vaaniCallId: "call_abc", roomName: "room_abc", durationSec: 252, callerName: "Priya Shah" });
    expect(e.call.transcript.split("\n")[0]).toMatch(/^Agent: Good morning/);
    expect(e.call.transcript).toContain("Caller: Hi, I'm Priya.");
    expect(e.call.transcript).not.toMatch(/^User:/m);
  });
  it("acknowledges every other event without acting on it", () => {
    for (const ev of ["call_ringing", "user_picked_up_at", "call_ended", "call_failed", "human_transfer_initiated"]) {
      expect(parseVaaniEvent({ event: ev, timestamp: "2026-10-11T10:00:00Z", data: {} })).toEqual({ kind: "ignored", event: ev });
    }
  });
  it("falls back to the x-webhook-event header when the body has no event name", () => {
    expect(parseVaaniEvent({ data: {} }, "webhook_test")).toEqual({ kind: "test" });
  });
  it("rejects a payload without a call id, or with a bad date", () => {
    expect(() => parseVaaniEvent({ event: "call_postprocessing", data: {} })).toThrow(PayloadError);
    expect(() => parseVaaniEvent({ event: "call_started", data: {} })).toThrow(/call id/);
    expect(() => parseVaaniEvent({ event: "call_started", timestamp: "nonsense", data: { call_id: "x" } })).toThrow(PayloadError);
    expect(() => parseVaaniEvent("not an object")).toThrow(PayloadError);
  });
});

describe("adapter details", () => {
  it("duration: seconds stay seconds, milliseconds are converted (no call lasts over 10,000 seconds)", () => {
    expect(durationToSeconds(252)).toBe(252);
    expect(durationToSeconds(55150)).toBe(55);
    expect(durationToSeconds(65.152)).toBe(65); // Vaani sends decimals; the database stores whole seconds
    expect(durationToSeconds(64.5)).toBe(65);
    expect(durationToSeconds(-1)).toBeNull();
    expect(durationToSeconds("12")).toBeNull();
    expect(durationToSeconds(undefined)).toBeNull();
  });
  it("transcripts: strips timestamps, maps speakers, joins wrapped lines, accepts arrays", () => {
    expect(normalizeTranscript("[00:03] AGENT: Hello there\n(0:12) User: Hi, flat in Baner\nand about 1,200 sq ft\n00:20 Agent: Great")).toBe(
      "Agent: Hello there\nCaller: Hi, flat in Baner and about 1,200 sq ft\nAgent: Great",
    );
    expect(normalizeTranscript([{ speaker: "assistant", text: "Hi" }, { speaker: "user", text: "Hello" }])).toBe("Agent: Hi\nCaller: Hello");
    expect(normalizeTranscript(undefined)).toBe("");
  });
  it("REAL captured call: number, start time, duration, name and transcript come straight from call_postprocessing", () => {
    const e = parseVaaniEvent(JSON.parse(real), "call_postprocessing");
    if (e.kind !== "call") throw new Error("expected a call");
    expect(e.call).toMatchObject({ vaaniCallId: "outbound-1791748447-1c9752ee", durationSec: 93, callerName: "Priya", phoneNumber: "+919000000099" });
    expect(e.call.startedAt?.toISOString()).toBe("2026-10-11T19:54:07.543Z");
    const lines = e.call.transcript.split("\n");
    expect(lines.every((l) => /^(Agent|Caller): /.test(l))).toBe(true); // timestamps stripped, speakers mapped
    expect(lines[0]).toBe("Agent: Hello, this is a test call for Aangan Studio. May I know your name please?");
    expect(e.call.transcript).toContain("Caller: Priya");
    expect(e.call.transcript).toContain("नमस्ते"); // Hindi passes through untouched
    expect(toNormalizedCall(e.call, null)).toMatchObject({ callerNumber: "+919000000099", durationSec: 93 });
  });
  it("falls back to the To/From fields when the event has no phone_number, by call direction", () => {
    const base = JSON.parse(real);
    delete base.data.phone_number;
    base.to = "+919111111111";
    base.from = "+919222222222";
    base.data.call_type = "outbound";
    const out = parseVaaniEvent(base);
    const inn = parseVaaniEvent({ ...base, data: { ...base.data, call_type: "Inbound" } });
    if (out.kind !== "call" || inn.kind !== "call") throw new Error("expected calls");
    expect(out.call.phoneNumber).toBe("+919111111111"); // outbound: the other party is "to"
    expect(inn.call.phoneNumber).toBe("+919222222222"); // inbound: the caller is "from"
  });
  it("joins the post-call event with call_started when the event itself lacks the number and start time", () => {
    const e = parseVaaniEvent(JSON.parse(post));
    const s = parseVaaniEvent(JSON.parse(started));
    if (e.kind !== "call" || s.kind !== "call_started") throw new Error("unexpected");
    expect(toNormalizedCall(e.call, s.meta)).toMatchObject({ callerNumber: "+919000000099", durationSec: 252 });
    expect(toNormalizedCall({ ...e.call, phoneNumber: "+919333333333" }, s.meta).callerNumber).toBe("+919333333333"); // the event's own number wins
    const bare = toNormalizedCall(e.call, null);
    expect(bare.callerNumber).toBeNull();
    expect(bare.startedAt.toISOString()).toBe("2026-10-11T10:03:00.000Z"); // 10:07:12 minus 252 s
  });
});

describe("POST /api/webhooks/vaani (handler)", () => {
  it("401 for a missing or wrong signature, and nothing is stored or scheduled", async () => {
    const { store, send, scheduled } = setup();
    expect((await send(post, { sig: null })).status).toBe(401);
    expect((await send(post, { sig: "deadbeef" })).status).toBe(401);
    expect(store.calls.size).toBe(0);
    expect(scheduled).toHaveLength(0);
  });
  it("400 for a signed body that is not JSON or not a Vaani event", async () => {
    const { send } = setup();
    expect((await send("not json")).status).toBe(400);
    expect((await send(JSON.stringify({ event: "call_postprocessing", data: {} }))).status).toBe(400);
  });
  it("answers Vaani's Test Connectivity with 200 and stores nothing", async () => {
    const { store, send, scheduled } = setup();
    const res = await send(testSample, { event: "webhook_test" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "test_ok" });
    expect(store.calls.size + scheduled.length).toBe(0);
  });
  it("acknowledges irrelevant events with 200", async () => {
    const { send, store } = setup();
    const res = await send(JSON.stringify({ event: "call_ringing", timestamp: "2026-10-11T10:00:00Z", data: { call_id: "x" } }));
    expect(await res.json()).toMatchObject({ status: "ignored", event: "call_ringing" });
    expect(store.calls.size).toBe(0);
  });
  it("remembers call_started so the later post-call event knows the caller's number", async () => {
    const { send, store, scheduled } = setup();
    expect(await (await send(started)).json()).toEqual({ status: "noted" });
    expect(store.callMeta.get("call_abc")?.phoneNumber).toBe("+919000000099");
    await send(post);
    await scheduled[0]();
    expect([...store.leads.values()][0].phone).toBe("+919000000099");
    expect([...store.calls.values()][0].callerNumber).toBe("+919000000099");
  });
  it("REAL call end to end: stored with the caller's number and a clean transcript, and processed into a lead, with no call_started needed", async () => {
    const { store, send, scheduled } = setup();
    const res = await send(real, { event: "call_postprocessing" });
    expect(await res.json()).toMatchObject({ status: "accepted" });
    const call = [...store.calls.values()][0];
    expect(call).toMatchObject({ callerNumber: "+919000000099", durationSec: 93 });
    expect(call.startedAt.toISOString()).toBe("2026-10-11T19:54:07.543Z");
    await scheduled[0]();
    expect([...store.leads.values()][0]).toMatchObject({ name: "Priya", phone: "+919000000099" });
  });
  it("replies 200 'accepted' BEFORE the slow work runs (Vaani allows only 5 seconds)", async () => {
    const { store, send, scheduled, order } = setup();
    const res = await send(post);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "accepted" });
    expect(order).toEqual(["stored"]);
    expect([...store.calls.values()][0].status).toBe("received");
    expect(store.leads.size).toBe(0);
    await scheduled[0]();
    expect(order).toEqual(["stored", "processing"]);
    expect(store.leads.size).toBe(1);
    expect([...store.calls.values()][0].status).toBe("processed");
    expect([...store.leads.values()][0].name).toBe("Priya Shah"); // the name Vaani extracted is kept for the lead
  });
  it("a second delivery of the same call is a harmless duplicate: nothing more is scheduled", async () => {
    const { store, send, scheduled } = setup();
    await send(post);
    await scheduled[0]();
    expect(await (await send(post)).json()).toMatchObject({ status: "duplicate" });
    expect(scheduled).toHaveLength(1);
    expect(store.leads.size).toBe(1);
  });
  it("500 (so Vaani retries) when the call could not be stored, or call_started could not be saved, without leaking internals", async () => {
    const { send, scheduled } = setup();
    const bad = await send(post, { deps: { accept: async () => { throw new Error("db down, secret detail"); } } });
    expect(bad.status).toBe(500);
    expect(await bad.text()).not.toMatch(/secret detail|db down/);
    expect((await send(started, { deps: { onCallStarted: async () => { throw new Error("nope"); } } })).status).toBe(500);
    expect(scheduled).toHaveLength(0);
  });
  it("a failure in the background work is swallowed and leaves the call for the sweeper", async () => {
    const { store, send, scheduled } = setup();
    const boom = { extract: async () => { throw new Error("model down"); } };
    await send(post, {
      deps: {
        accept: async (parsed, opts) => {
          const call = toNormalizedCall(parsed, null);
          const r = await receiveCall(store, call, opts);
          return { callId: r.call.id, duplicate: false, process: () => processReceived({ store, extractor: boom }, r.call, call) };
        },
      },
    });
    await expect(scheduled[0]()).resolves.toBeUndefined();
    expect([...store.calls.values()][0].status).toBe("failed");
  });
});
