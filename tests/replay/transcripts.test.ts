import { describe, it, expect } from "vitest";
import { loadPhoneTranscripts } from "@/replay/transcripts";
import { HELD_OUT, PROMPT_EXAMPLES } from "@/replay/split";
import { EXPECTED } from "@/replay/expected";
import { GOLDEN } from "@/replay/golden";

const calls = loadPhoneTranscripts();

describe("phone transcript parser", () => {
  it("finds 21 call legs for the 20 enquiries (T17 is two calls)", () => {
    expect(calls).toHaveLength(21);
    expect(new Set(calls.map((c) => c.baseId)).size).toBe(20);
    expect(calls.filter((c) => c.baseId === "T17").map((c) => c.id)).toEqual(["T17a", "T17b"]);
  });
  it("converts IST times to UTC and orders calls chronologically", () => {
    const t01 = calls.find((c) => c.id === "T01")!;
    expect(t01.startedAt.toISOString()).toBe("2026-09-02T04:53:00.000Z"); // 10:23am IST
    const times = calls.map((c) => c.startedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
  it("parses durations, the missed call, and the dropped first call", () => {
    expect(calls.find((c) => c.id === "T01")!.durationSec).toBe(252);
    expect(calls.find((c) => c.id === "T08")).toMatchObject({ durationSec: 0, transcript: "" });
    expect(calls.find((c) => c.id === "T17a")!.durationSec).toBe(72);
    expect(calls.find((c) => c.id === "T17b")!.durationSec).toBe(270);
    expect(calls.find((c) => c.id === "T17a")!.callerNumber).toBe(calls.find((c) => c.id === "T17b")!.callerNumber);
  });
  it("never leaks the front desk's outcome notes into the transcript", () => {
    for (const c of calls) {
      expect(c.transcript, c.id).not.toMatch(/\bNote:|Escalated to studio head|Handle with care|Re-logged|ESCALATE/);
    }
  });
  it("joins lines that were wrapped by the PDF", () => {
    expect(calls.find((c) => c.id === "T01")!.transcript).toContain("We have a 3BHK in Kothrud — Dahanukar Colony. We bought it two years ago and it still looks like the builder flat.");
  });
});

describe("test-set hygiene", () => {
  it("prompt examples and held-out calls partition all 20 enquiries with no overlap", () => {
    const all = [...PROMPT_EXAMPLES, ...HELD_OUT].sort();
    expect(all).toEqual(Object.keys(EXPECTED).sort());
    expect(new Set(all).size).toBe(20);
    expect(PROMPT_EXAMPLES).toHaveLength(10);
  });
  it("every enquiry that needs one has a hand label (T08 and T17a are caught before extraction)", () => {
    const need = calls.map((c) => c.id).filter((id) => !["T08", "T17a"].includes(id));
    for (const id of need) expect(GOLDEN[id], id).toBeTruthy();
  });
});
