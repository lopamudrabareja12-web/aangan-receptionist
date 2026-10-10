import { describe, it, expect } from "vitest";
import { computeCallCost, DEFAULT_RATES } from "@/lib/pipeline/costs";
import { composeHandoffNote } from "@/lib/pipeline/handoff";
import { applyRubric } from "@/lib/pipeline/rubric";
import { ExtractionSchema } from "@/lib/pipeline/extraction-schema";
import { istMorning, nextWorkingStart } from "@/lib/time";

describe("computeCallCost", () => {
  it("rates a 4.6 minute call at Rs 5/min and a typical extraction", () => {
    const c = computeCallCost({ durationSec: 276, inputTokens: 3000, outputTokens: 500 }, DEFAULT_RATES);
    expect(c.voiceMinutes).toBe(4.6);
    expect(c.voiceCostInr).toBe(23);
    expect(c.llmCostInr).toBeCloseTo(((3000 * 0.3 + 500 * 2.5) / 1e6) * 85, 4);
  });
  it("a call with no duration costs nothing", () => {
    expect(computeCallCost({ durationSec: null, inputTokens: 0, outputTokens: 0 }, DEFAULT_RATES)).toMatchObject({ voiceCostInr: 0, llmCostInr: 0 });
  });
});

describe("working hours", () => {
  it("inside hours returns the same moment; after hours rolls to 10:00 IST the next day; before 10:00 same day", () => {
    const inside = new Date("2026-09-10T06:00:00Z"); // 11:30 IST
    expect(nextWorkingStart(inside)).toEqual(inside);
    expect(nextWorkingStart(new Date("2026-09-09T17:17:00Z")).toISOString()).toBe("2026-09-10T04:30:00.000Z"); // 22:47 IST -> 10:00 IST next day
    expect(nextWorkingStart(new Date("2026-09-10T02:00:00Z")).toISOString()).toBe("2026-09-10T04:30:00.000Z"); // 07:30 IST -> 10:00 IST
    expect(nextWorkingStart(new Date("2026-09-10T13:30:00Z")).toISOString()).toBe("2026-09-11T04:30:00.000Z"); // exactly 19:00 IST is closed
  });
  it("istMorning is 10:00 IST on a date", () => {
    expect(istMorning("2026-11-01").toISOString()).toBe("2026-11-01T04:30:00.000Z");
  });
});

describe("handoff note", () => {
  const ex = ExtractionSchema.parse({
    call_type: "new_enquiry", project_category: "residential", scope_kind: "full_redesign", location: "Baner <script>", property_type: "2BHK", carpet_area_sqft: 1200,
    scope_summary: null, rooms: ["kitchen"], whole_or_partial: "whole", furniture_needed: null, storage_needs: null, structural_work: "none", property_status: null,
    timeline_text: null, ready_by_date: null, can_start_after_date: null, owner_status: "on_behalf", decision_maker_confirmed: null,
    budget_volunteered_inr: null, referral_source: null, is_vip_referral: false, price_asked: true, language: "en", summary: "Two sentences.",
  });
  const rubric = applyRubric({ extraction: ex, callStartedAt: new Date("2026-09-10T06:00:00Z") });
  const note = composeHandoffNote({ extraction: ex, rubric, callerName: "Priya", callerPhone: "+919000000001", callStartedAt: new Date("2026-09-10T06:00:00Z"), callId: "c1" });
  it("states what was and was not captured, so the designer does not re-ask", () => {
    expect(note.text).toContain("Caller: Priya · +919000000001");
    expect(note.text).toContain("Timeline: (not captured)");
    expect(note.text).toContain("Not covered on the call:");
    expect(note.text).toContain("Caller is acting for the owner(s)");
  });
  it("says the price was deflected and never contains a number for it", () => {
    expect(note.text).toContain("no number was given");
    expect(note.text).not.toMatch(/per sq ?ft/i);
  });
  it("escapes HTML from caller-supplied text", () => {
    expect(note.html).not.toContain("<script>");
    expect(note.html).toContain("&lt;script&gt;");
  });
});
