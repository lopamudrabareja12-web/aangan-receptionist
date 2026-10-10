import { describe, it, expect } from "vitest";
import { formatReport, runReplay } from "@/replay/run";
import { loadPhoneTranscripts } from "@/replay/transcripts";
import { GOLDEN } from "@/replay/golden";

describe("Replay Lab (offline, hand-labelled extractions, mock HubSpot)", () => {
  it("all 20 historical enquiries reach the intended outcome, in both halves of the split", async () => {
    const r = await runReplay({ calls: loadPhoneTranscripts() });
    const failures = r.rows.filter((x) => !x.match).map((x) => `${x.id}: ${x.problems.join("; ")}`);
    expect(failures).toEqual([]);
    expect(r.summary).toMatchObject({ total: 20, matched: 20, examples: { total: 10, matched: 10 }, heldOut: { total: 10, matched: 10 } });
  });
  it("every safety invariant holds", async () => {
    const r = await runReplay({ calls: loadPhoneTranscripts() });
    expect(r.invariants.filter((i) => !i.ok)).toEqual([]);
    expect(r.invariants.length).toBeGreaterThanOrEqual(5);
  });
  it("what reaches (mock) HubSpot: 20 deals for 21 call legs, 5 tasks, the dropped call never becomes a deal", async () => {
    const r = await runReplay({ calls: loadPhoneTranscripts() });
    expect(r.hubspot).toMatchObject({ deals: 20, tasks: 5, contacts: 20 });
  });
  it("is able to FAIL: a wrong label is reported, not hidden", async () => {
    const saved = { ...GOLDEN.T03 };
    GOLDEN.T03 = { ...GOLDEN.T03, location: "Kothrud" }; // pretend the model misread Nashik as Kothrud
    try {
      const r = await runReplay({ calls: loadPhoneTranscripts() });
      const t03 = r.rows.find((x) => x.id === "T03")!;
      expect(t03.match).toBe(false);
      expect(t03.problems.join()).toMatch(/decision qualified|expected declined/);
      expect(r.summary.matched).toBe(19);
      expect(formatReport(r)).toContain("FAIL  T03");
    } finally {
      GOLDEN.T03 = saved;
    }
  });
  it("the report states plainly that the golden run does not measure Gemini", async () => {
    expect(formatReport(await runReplay({ calls: loadPhoneTranscripts() }))).toMatch(/NOT Gemini's accuracy/);
  });
});
