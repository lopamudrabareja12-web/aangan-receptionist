import { describe, it, expect } from "vitest";
import { ExtractionError, GeminiExtractor, buildPrompt } from "@/lib/pipeline/extractor";
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
