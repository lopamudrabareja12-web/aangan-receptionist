import { describe, it, expect } from "vitest";
import { ExtractionSchema, type Extraction } from "@/lib/pipeline/extraction-schema";
import { addDays, applyRubric, istDate, weeksBetween } from "@/lib/pipeline/rubric";

const x = (o: Partial<Extraction> = {}): Extraction =>
  ExtractionSchema.parse({
    call_type: "new_enquiry", project_category: "residential", scope_kind: "full_redesign", location: "Baner", property_type: "3BHK",
    carpet_area_sqft: 1200, scope_summary: "x", rooms: [], whole_or_partial: "whole", furniture_needed: "custom", storage_needs: "wardrobes",
    structural_work: "none", property_status: "empty", timeline_text: "by March", ready_by_date: "2027-03-31", can_start_after_date: null,
    owner_status: "owner", decision_maker_confirmed: true, budget_volunteered_inr: null, referral_source: "friend", is_vip_referral: false,
    price_asked: false, language: "en", summary: "s", ...o,
  });
const at = new Date("2026-09-10T06:00:00Z"); // 11:30 IST, 10 Sep 2026
const run = (o: Partial<Extraction>) => applyRubric({ extraction: x(o), callStartedAt: at });

describe("dates (Asia/Kolkata)", () => {
  it("uses the IST calendar date, not UTC", () => {
    expect(istDate(new Date("2026-09-09T20:00:00Z"))).toBe("2026-09-10"); // 01:30 IST next day
  });
  it("adds days and counts weeks", () => {
    expect(addDays("2026-09-10", 30)).toBe("2026-10-10");
    expect(weeksBetween("2026-09-10", "2026-10-22")).toBe(6);
  });
});

describe("hard fails", () => {
  it.each(["restaurant", "hotel", "retail", "gym"] as const)("%s is declined as out of scope", (c) => {
    expect(run({ project_category: c })).toMatchObject({ decision: "declined", reasonCode: "out_of_scope_type" });
  });
  it("declines outside Pune/PCMC, even when the text also says Pune", () => {
    expect(run({ location: "Talegaon Dabhade, near Pune" })).toMatchObject({ decision: "declined", reasonCode: "out_of_area" });
    expect(run({ location: "Nashik" })).toMatchObject({ reasonCode: "out_of_area" });
  });
  it("declines advice-only with a revisit date 30 days out", () => {
    expect(run({ scope_kind: "advice_only" })).toMatchObject({ decision: "declined", reasonCode: "advice_only", revisitOn: "2026-10-10" });
  });
  it("declines structural-only work", () => {
    expect(run({ scope_kind: "structural_only" })).toMatchObject({ reasonCode: "structural_only" });
  });
  it("an unknown location is NOT a decline: it is forwarded with a flag", () => {
    const r = run({ location: "Somewhere new" });
    expect(r.decision).toBe("qualified_flagged");
    expect(r.flags).toContain("location_unclear");
  });
});

describe("budget (only when volunteered, never probed)", () => {
  it("a clearly-too-low volunteered budget is declined, not forwarded", () => {
    expect(run({ budget_volunteered_inr: 150_000 })).toMatchObject({ decision: "declined", reasonCode: "budget_too_low" });
  });
  it("a reasonable volunteered budget is fine, and no budget at all is fine", () => {
    expect(run({ budget_volunteered_inr: 1_500_000 }).decision).toBe("qualified");
    expect(run({ budget_volunteered_inr: null }).decision).toBe("qualified");
  });
});

describe("timeline", () => {
  it("under 6 weeks is deferred, revisiting on the date the caller offered", () => {
    const r = run({ ready_by_date: "2026-10-01", can_start_after_date: "2026-11-01" });
    expect(r).toMatchObject({ decision: "deferred", reasonCode: "timeline_too_short", revisitOn: "2026-11-01" });
  });
  it("under 6 weeks with no later date offered revisits in 8 weeks", () => {
    expect(run({ ready_by_date: "2026-10-01" }).revisitOn).toBe("2026-11-05");
  });
  it("6 to 8 weeks is forwarded but flagged as tight", () => {
    const r = run({ ready_by_date: "2026-10-30" }); // ~7 weeks
    expect(r.decision).toBe("qualified_flagged");
    expect(r.flags).toContain("timeline_tight");
  });
  it("8 weeks or more is clean", () => {
    expect(run({ ready_by_date: "2026-11-12" }).flags).not.toContain("timeline_tight");
  });
  it("exactly 6 weeks is not deferred (the floor is 'under 6')", () => {
    expect(run({ ready_by_date: "2026-10-22" }).decision).toBe("qualified_flagged");
  });
  it("a possession date is not a deadline: no deadline means no timeline rule fires", () => {
    expect(run({ ready_by_date: null, timeline_text: "possession in six weeks, start design now" }).decision).toBe("qualified");
  });
});

describe("escalation: never a new enquiry", () => {
  it("complaint and follow-up failure escalate and skip every other rule", () => {
    expect(run({ call_type: "existing_client_complaint", location: "Nashik", project_category: "restaurant" })).toMatchObject({ decision: "escalation", reasonCode: "existing_client_complaint" });
    expect(run({ call_type: "follow_up_failure" })).toMatchObject({ decision: "escalation", reasonCode: "follow_up_failure" });
  });
});

describe("flags and what does NOT disqualify", () => {
  it("caller acting for the owner is forwarded with a flag", () => {
    expect(run({ owner_status: "on_behalf" })).toMatchObject({ decision: "qualified_flagged" });
  });
  it("decision-maker clearly absent is flagged, not declined", () => {
    expect(run({ decision_maker_confirmed: false }).flags).toContain("decision_maker_unconfirmed");
  });
  it("renting, single room, asking for price and not knowing style never disqualify", () => {
    const r = run({ owner_status: "tenant", scope_kind: "single_room", price_asked: true, structural_work: "none" });
    expect(r.decision).toBe("qualified");
    expect(r.flags).toEqual(["price_asked"]);
  });
  it("VIP and price_asked alone do not make a lead 'flagged'", () => {
    expect(run({ is_vip_referral: true, price_asked: true }).decision).toBe("qualified");
  });
  it("commercial size flags: small and large forward with a flag", () => {
    expect(run({ project_category: "commercial_office", carpet_area_sqft: 180 }).flags).toContain("small_commercial_below_typical");
    expect(run({ project_category: "commercial_office", carpet_area_sqft: 4000 }).flags).toContain("large_commercial_above_typical");
    expect(run({ project_category: "commercial_office", carpet_area_sqft: 800 }).decision).toBe("qualified");
  });
  it("lists what the call did not cover, without flagging the lead for it", () => {
    const r = run({ furniture_needed: null, storage_needs: null, referral_source: null });
    expect(r.missingFields).toEqual(expect.arrayContaining(["furniture_needed", "storage_needs", "referral_source"]));
    expect(r.decision).toBe("qualified");
  });
  it("is deterministic: the same input always gives the same result", () => {
    expect(run({ ready_by_date: "2026-10-30" })).toEqual(run({ ready_by_date: "2026-10-30" }));
  });
});
