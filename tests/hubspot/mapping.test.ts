import { describe, it, expect } from "vitest";
import { buildDealProperties, estimatedAmount, stageForDecision, ESTIMATE_NOTICE } from "@/lib/hubspot/deal-mapping";
import { DECISIONS } from "@/lib/domain";
import { normalizePhone } from "@/lib/phone";

const base = { callId: "c1", isVip: false, flags: [], avgProjectValueInr: 1_100_000 };

describe("deal mapping", () => {
  it("every decision maps to a stage, and declines go to review, not to the pipeline", () => {
    for (const d of DECISIONS) expect(stageForDecision(d)).toBeTruthy();
    expect(stageForDecision("declined")).toBe("declined_review");
    expect(stageForDecision("qualified_flagged")).toBe("new_qualified");
    expect(stageForDecision("escalation")).toBe("escalation");
    expect(stageForDecision("incomplete")).toBe("incomplete_call");
  });

  it("amount is set only for qualified leads", () => {
    expect(estimatedAmount("qualified", 1_100_000)).toBe(1_100_000);
    expect(estimatedAmount("qualified_flagged", 1_100_000)).toBe(1_100_000);
    for (const d of ["declined", "deferred", "escalation", "incomplete"] as const) {
      expect(estimatedAmount(d, 1_100_000)).toBeUndefined();
    }
  });

  it("a qualified deal carries the estimate amount and the 'ESTIMATE' label in its description", () => {
    const p = buildDealProperties({ ...base, decision: "qualified", name: "Priya", location: "Kothrud", propertyType: "3BHK", carpetAreaSqft: 1400, referralSource: "Shruti Joshi", isVip: true }, "stage1", "pipe1");
    expect(p.amount).toBe(1_100_000);
    expect(String(p.description)).toContain(ESTIMATE_NOTICE);
    expect(p.hs_priority).toBe("HIGH");
    expect(p.dealname).toBe("Priya · 3BHK · Kothrud");
    expect(p).toMatchObject({ pipeline: "pipe1", dealstage: "stage1", aangan_call_id: "c1", aangan_carpet_area_sqft: 1400 });
  });

  it("a declined deal has no amount and no estimate label, and blank fields are omitted", () => {
    const p = buildDealProperties({ ...base, decision: "declined", declineDetail: "Outside Pune/PCMC (Nashik)" }, "s", "p");
    expect(p).not.toHaveProperty("amount");
    expect(p).not.toHaveProperty("hs_priority");
    expect(p).not.toHaveProperty("aangan_carpet_area_sqft");
    expect(String(p.description)).toBe("Reason: Outside Pune/PCMC (Nashik)");
  });
});

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+14155550123", "+14155550123"],
  ])("%s -> %s", (raw, want) => expect(normalizePhone(raw)).toBe(want));
  it.each([[""], [null], [undefined], ["12345"], ["abc"]])("rejects %s", (raw) => expect(normalizePhone(raw as string)).toBeNull());
});
