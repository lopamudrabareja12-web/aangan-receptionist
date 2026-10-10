import { describe, it, expect } from "vitest";
import { guessCallerName, redactForLlm } from "@/lib/pipeline/redact";
import { loadPhoneTranscripts } from "@/replay/transcripts";

describe("redaction (hard rule 7: no caller identifiers to Gemini)", () => {
  it("removes phone numbers in common Indian formats and emails", () => {
    const t = "Caller: call me on 98765 43210 or +91-9876543210 or 09876543210, mail priya@example.com";
    const { text, redactions } = redactForLlm(t, null);
    expect(text).not.toMatch(/\d{5}/);
    expect(text).not.toContain("priya@example.com");
    expect(redactions).toBe(4);
  });
  it("keeps square footage and rupee amounts intact", () => {
    const { text } = redactForLlm("Caller: 1,400 sq ft, budget 1 to 1.5 lakh, 5,500 sq ft", null);
    expect(text).toBe("Caller: 1,400 sq ft, budget 1 to 1.5 lakh, 5,500 sq ft");
  });
  it("removes the caller's own name wherever it appears, case-insensitively", () => {
    const { text } = redactForLlm("Caller: I'm Priya Shah. Agent: Thanks priya, and Shah.", "Priya Shah");
    expect(text).not.toMatch(/priya|shah/i);
  });
  it("finds the caller's name from their own lines only", () => {
    expect(guessCallerName("Agent: This is Aangan Studio\nCaller: Hi, I'm Ritu Kapoor from Pimple Saudagar.")).toBe("Ritu Kapoor");
    expect(guessCallerName("Caller: I'm calling about a project\nCaller: I'm in a rented flat")).toBeNull();
  });
  it("detects the names actually spoken in the real calls (so the leak check below is not vacuous)", () => {
    const names = Object.fromEntries(loadPhoneTranscripts().map((c) => [c.id, guessCallerName(c.transcript)]));
    expect(names).toMatchObject({ T01: "Priya", T03: "Suresh Patil", T05: "Aarti Mehta", T12: "Anand Sharma", T15: "Smita", T17b: "Ritu Kapoor", T20: "Pooja" });
  });
  it("on all 20 real transcripts: the guessed name never survives and no phone-like numbers remain", () => {
    for (const c of loadPhoneTranscripts()) {
      const name = guessCallerName(c.transcript);
      const { text } = redactForLlm(c.transcript, name);
      if (name) for (const part of name.split(" ")) expect(text, `${c.id} leaked ${part}`).not.toMatch(new RegExp(`\\b${part}\\b`, "i"));
      expect(text, c.id).not.toMatch(/\d{10}/);
    }
  });
});
