import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handleVaaniWebhook } from "@/lib/pipeline/webhook-handler";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { processCall } from "@/lib/pipeline/process-call";
import { GoldenExtractor } from "@/replay/golden";
import { parseVaaniPayload, PayloadError } from "@/lib/vaani/adapter";
import { SIGNATURE_HEADER, sign, verifySignature } from "@/lib/vaani/signature";

const SECRET = "test-secret";
const fixture = readFileSync(path.join(__dirname, "../../fixtures/vaani/FAKE-sample-call.json"), "utf8");

const setup = () => {
  const store = new MemoryStore();
  const golden = new GoldenExtractor();
  golden.current = "T01";
  const process = (call: Parameters<typeof processCall>[1], opts: { rawPayload: unknown }) => processCall({ store, extractor: golden }, call, opts);
  const post = (body: string, sig: string | null) =>
    handleVaaniWebhook(new Request("http://localhost/api/webhooks/vaani", { method: "POST", body, headers: sig === null ? {} : { [SIGNATURE_HEADER]: sig } }), { secret: SECRET, process });
  return { store, post };
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
  it("401 for a missing or wrong signature, and nothing is stored", async () => {
    const { store, post } = setup();
    expect((await post(fixture, null)).status).toBe(401);
    expect((await post(fixture, "deadbeef")).status).toBe(401);
    expect(store.calls.size).toBe(0);
  });
  it("400 for a signed body that is not JSON or not a call", async () => {
    const { post } = setup();
    expect((await post("not json", sign("not json", SECRET))).status).toBe(400);
    const odd = JSON.stringify({ hello: "world" });
    expect((await post(odd, sign(odd, SECRET))).status).toBe(400);
  });
  it("200 processes a signed call, and a second delivery is a harmless duplicate", async () => {
    const { store, post } = setup();
    const first = await post(fixture, sign(fixture, SECRET));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "processed", decision: "qualified" });
    const second = await post(fixture, sign(fixture, SECRET));
    expect(await second.json()).toMatchObject({ status: "duplicate" });
    expect(store.leads.size).toBe(1);
  });
  it("500 (so Vaani retries) when processing fails, without leaking internals", async () => {
    const store = new MemoryStore();
    const boom = { extract: async () => { throw new Error("secret internal detail GEMINI_API_KEY=abc"); } };
    const res = await handleVaaniWebhook(new Request("http://x", { method: "POST", body: fixture, headers: { [SIGNATURE_HEADER]: sign(fixture, SECRET) } }), {
      secret: SECRET, process: (c, o) => processCall({ store, extractor: boom }, c, o),
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/secret internal|GEMINI/);
  });
});
