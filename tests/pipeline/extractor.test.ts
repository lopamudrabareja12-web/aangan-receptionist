import { describe, it, expect } from "vitest";
import { ExtractionError, GeminiExtractor, buildPrompt, withRetry } from "@/lib/pipeline/extractor";
import { GOLDEN } from "@/replay/golden";
import { GoldenExtractor } from "@/replay/golden";

const valid = async () => (await Object.assign(new GoldenExtractor(), { current: "T01" }).extract()).extraction;

describe("GeminiExtractor (fake model)", () => {
  it("parses a valid structured answer and reports token usage", async () => {
    const ex = new GeminiExtractor(async () => ({ text: JSON.stringify(await valid()), inputTokens: 900, outputTokens: 250 }));
    const r = await ex.extract({ redactedTranscript: "Caller: hi", callDate: "2026-09-02" });
    expect(r.extraction.carpet_area_sqft).toBe(1400);
    expect(r.usage).toEqual({ inputTokens: 900, outputTokens: 250 });
  });
  it("retries once on malformed output, adds up the tokens, then succeeds", async () => {
    const prompts: string[] = [];
    let n = 0;
    const ex = new GeminiExtractor(async (p) => {
      prompts.push(p);
      return n++ === 0 ? { text: "not json", inputTokens: 100, outputTokens: 10 } : { text: JSON.stringify(await valid()), inputTokens: 100, outputTokens: 50 };
    });
    const r = await ex.extract({ redactedTranscript: "x", callDate: "2026-09-02" });
    expect(r.usage).toEqual({ inputTokens: 200, outputTokens: 60 });
    expect(prompts[1]).toContain("previous answer was invalid");
  });
  it("throws ExtractionError after two bad answers (so the webhook can be retried)", async () => {
    const ex = new GeminiExtractor(async () => ({ text: JSON.stringify({ call_type: "banana" }), inputTokens: 1, outputTokens: 1 }));
    await expect(ex.extract({ redactedTranscript: "x", callDate: "2026-09-02" })).rejects.toBeInstanceOf(ExtractionError);
  });
  it("rejects an answer that breaks the schema, e.g. a wrong enum", async () => {
    const bad = { ...(await valid()), scope_kind: "whatever" };
    const ex = new GeminiExtractor(async () => ({ text: JSON.stringify(bad), inputTokens: 1, outputTokens: 1 }));
    await expect(ex.extract({ redactedTranscript: "x", callDate: "2026-09-02" })).rejects.toThrow(/schema/);
  });
  it("the prompt never contains pricing-guide content and tells the model not to output names", () => {
    const p = buildPrompt("Caller: hi", "2026-09-02");
    expect(p).toMatch(/Never output a person's name or a phone number/);
    expect(p).not.toMatch(/₹|per sq ?ft|1,800|2,400|3,500/);
    expect(p).toContain("2026-09-02");
  });
  it("every hand label is itself a valid extraction", async () => {
    for (const id of Object.keys(GOLDEN)) {
      const g = new GoldenExtractor();
      g.current = id;
      await expect(g.extract()).resolves.toBeTruthy();
    }
  });
});

describe("withRetry (free-tier rate limits)", () => {
  it("retries a 429, waiting as long as the API's hint says", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const out = await withRetry(async () => { if (n++ === 0) throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Please retry in 12.5s"}}'); return "ok"; }, { sleep: async (ms) => void sleeps.push(ms) });
    expect(out).toBe("ok");
    expect(sleeps).toEqual([13000]);
  });
  it("backs off exponentially without a hint, and gives up after the retry limit", async () => {
    const sleeps: number[] = [];
    await expect(withRetry(async () => { throw new Error("503 UNAVAILABLE"); }, { retries: 3, sleep: async (ms) => void sleeps.push(ms) })).rejects.toThrow("503");
    expect(sleeps).toEqual([5000, 10000, 20000]);
  });
  it("does not retry a real error such as a bad key", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new Error("403 PERMISSION_DENIED"); }, { sleep: async () => {} })).rejects.toThrow("403");
    expect(n).toBe(1);
  });
});
