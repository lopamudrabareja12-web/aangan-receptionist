import type { Decision } from "@/lib/domain";
import type { Extraction } from "./extraction-schema";
import { classifyLocation } from "./service-area";

// Nikhil's rubric (source/qualified.md) plus the hard-fail rules from CLAUDE.md, as deterministic code.
// Pure: the same input always gives the same decision. No AI, no network, no clock (the call time is passed in).

export const RUBRIC_VERSION = "2026-10-10.1";

export interface RubricConfig {
  /** services.md: cannot begin execution on a project needing to be ready in under this many weeks. */
  hardFloorWeeks: number;
  /** qualified.md: site ready within 8-10 weeks of the consultation. Below this (but above the floor) is flagged as tight. */
  normWeeks: number;
  /** A volunteered budget below this is "clearly too low" for any scope with execution. TO CONFIRM WITH NIKHIL. */
  budgetFloorInr: number;
  /** The human desk quoted ~500 sq ft; services.md states no minimum. Below this we FLAG, we do not decline. */
  smallCommercialSqft: number;
  /** services.md: commercial up to ~3,000 sq ft. */
  largeCommercialSqft: number;
  /** When advice-only callers are declined, when to suggest revisiting. */
  adviceRevisitDays: number;
  /** Default revisit gap for a too-tight timeline when the caller offered no later start date. */
  deferredDefaultWeeks: number;
}

export const DEFAULT_RUBRIC: RubricConfig = {
  hardFloorWeeks: 6,
  normWeeks: 8,
  budgetFloorInr: 300_000,
  smallCommercialSqft: 500,
  largeCommercialSqft: 3_000,
  adviceRevisitDays: 30,
  deferredDefaultWeeks: 8,
};

export type ReasonCode =
  | "existing_client_complaint" | "follow_up_failure"
  | "out_of_scope_type" | "out_of_area" | "advice_only" | "structural_only" | "budget_too_low"
  | "timeline_too_short" | "incomplete_call";

/** Flags that make a forwarded lead "qualified_flagged": the designer needs to look at something. */
export const ATTENTION_FLAGS = [
  "timeline_tight", "caller_on_behalf", "decision_maker_unconfirmed", "missing_carpet_area",
  "missing_timeline", "location_unclear", "small_commercial_below_typical", "large_commercial_above_typical",
] as const;

export interface RubricInput {
  extraction: Extraction;
  callStartedAt: Date;
  config?: Partial<RubricConfig>;
}

export interface RubricResult {
  decision: Decision;
  reasonCode: ReasonCode | null;
  detail: string | null;
  flags: string[];
  missingFields: string[];
  revisitOn: string | null; // YYYY-MM-DD
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
/** Calendar date (YYYY-MM-DD) in Asia/Kolkata. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
const dayNumber = (isoDate: string) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
export function addDays(isoDate: string, days: number): string {
  return new Date((dayNumber(isoDate) + days) * 86_400_000).toISOString().slice(0, 10);
}
export function weeksBetween(fromIso: string, toIso: string): number {
  return (dayNumber(toIso) - dayNumber(fromIso)) / 7;
}

const validDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function applyRubric(input: RubricInput): RubricResult {
  const cfg = { ...DEFAULT_RUBRIC, ...input.config };
  const x = input.extraction;
  const today = istDate(input.callStartedAt);
  const decline = (reasonCode: ReasonCode, detail: string, revisitOn: string | null = null): RubricResult => ({
    decision: "declined", reasonCode, detail, flags: [], missingFields: [], revisitOn,
  });

  // 1. Not a new enquiry: never treated as one, always escalated to Nikhil.
  if (x.call_type === "existing_client_complaint") {
    return { decision: "escalation", reasonCode: "existing_client_complaint", detail: "Existing client complaint; a senior must call back.", flags: ["complaint"], missingFields: [], revisitOn: null };
  }
  if (x.call_type === "follow_up_failure") {
    return { decision: "escalation", reasonCode: "follow_up_failure", detail: "Caller says an earlier enquiry was never followed up; handle with care.", flags: ["follow_up_failure"], missingFields: [], revisitOn: null };
  }

  // 2. Hard fails. Order: scope type, area, advice-only, structural-only.
  if (["restaurant", "hotel", "retail", "gym"].includes(x.project_category)) {
    return decline("out_of_scope_type", `${x.project_category} projects are out of scope (residential and small offices/clinics/studios only).`);
  }
  const area = classifyLocation(x.location);
  if (area === "out_of_area") {
    return decline("out_of_area", `Site (${x.location}) is outside Pune city and PCMC.`);
  }
  if (x.scope_kind === "advice_only") {
    return decline("advice_only", "Caller wants advice or ideas only; the studio does design with execution.", addDays(today, cfg.adviceRevisitDays));
  }
  if (x.scope_kind === "structural_only") {
    return decline("structural_only", "Structural or civil work only; the studio does no structural work.");
  }

  // 3. A volunteered, clearly-too-low budget is not forwarded (qualified.md). We never probe for one.
  if (x.budget_volunteered_inr !== null && x.budget_volunteered_inr < cfg.budgetFloorInr) {
    return decline("budget_too_low", `Caller volunteered a budget of about Rs ${x.budget_volunteered_inr.toLocaleString("en-IN")}, clearly below what a design-and-execution project of this scope needs.`);
  }

  // 4. Timeline. Only a stated finish deadline counts; a possession date does not.
  const flags: string[] = [];
  if (validDate(x.ready_by_date)) {
    const weeks = weeksBetween(today, x.ready_by_date);
    if (weeks < cfg.hardFloorWeeks) {
      const revisit = validDate(x.can_start_after_date) ? x.can_start_after_date : addDays(today, cfg.deferredDefaultWeeks * 7);
      return {
        decision: "deferred", reasonCode: "timeline_too_short",
        detail: `Needs the project finished in about ${Math.max(0, Math.round(weeks))} weeks; execution cannot begin under ${cfg.hardFloorWeeks} weeks.`,
        flags: [], missingFields: [], revisitOn: revisit,
      };
    }
    if (weeks < cfg.normWeeks) flags.push("timeline_tight");
  }

  // 5. Forwarded. Collect what the designer should look at.
  if (x.owner_status === "on_behalf") flags.push("caller_on_behalf");
  if (x.decision_maker_confirmed === false) flags.push("decision_maker_unconfirmed");
  if (x.carpet_area_sqft === null) flags.push("missing_carpet_area");
  if (x.timeline_text === null && !validDate(x.ready_by_date)) flags.push("missing_timeline");
  if (area === "unknown") flags.push("location_unclear");
  if (x.project_category === "commercial_office" && x.carpet_area_sqft !== null) {
    if (x.carpet_area_sqft < cfg.smallCommercialSqft) flags.push("small_commercial_below_typical");
    if (x.carpet_area_sqft > cfg.largeCommercialSqft) flags.push("large_commercial_above_typical");
  }
  // Informational flags (do not by themselves mark a lead "flagged").
  if (x.is_vip_referral) flags.push("vip");
  if (x.price_asked) flags.push("price_asked");

  const missingFields: string[] = [];
  if (x.furniture_needed === null) missingFields.push("furniture_needed");
  if (x.storage_needs === null) missingFields.push("storage_needs");
  if (x.structural_work === "unknown") missingFields.push("structural_work");
  if (x.property_status === null) missingFields.push("property_status");
  if (x.referral_source === null) missingFields.push("referral_source");
  if (x.decision_maker_confirmed === null && x.owner_status === "unknown") missingFields.push("decision_maker");

  const needsAttention = flags.some((f) => (ATTENTION_FLAGS as readonly string[]).includes(f));
  return {
    decision: needsAttention ? "qualified_flagged" : "qualified",
    reasonCode: null, detail: null, flags, missingFields, revisitOn: null,
  };
}
