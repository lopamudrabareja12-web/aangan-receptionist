import { z } from "zod";

// What the model reads out of a finished call. It never contains the caller's name or phone number:
// identifiers are kept out of Gemini inputs (hard rule 7) and live only in Supabase.
export const ExtractionSchema = z.object({
  call_type: z.enum(["new_enquiry", "existing_client_complaint", "follow_up_failure", "other"])
    .describe("existing_client_complaint = an existing project's client complaining; follow_up_failure = caller says an earlier enquiry was never followed up."),
  project_category: z.enum(["residential", "commercial_office", "restaurant", "hotel", "retail", "gym", "other", "unknown"]),
  scope_kind: z.enum(["full_redesign", "partial_rooms", "single_room", "advice_only", "structural_only", "unknown"])
    .describe("advice_only = wants ideas/suggestions/styling without design + execution."),
  location: z.string().nullable().describe("Locality or city of the site, as said by the caller."),
  property_type: z.string().nullable().describe("e.g. 3BHK apartment, villa, office, clinic."),
  carpet_area_sqft: z.number().nullable(),
  scope_summary: z.string().nullable(),
  rooms: z.array(z.string()),
  whole_or_partial: z.enum(["whole", "partial", "unknown"]),
  furniture_needed: z.string().nullable(),
  storage_needs: z.string().nullable(),
  structural_work: z.enum(["none", "some", "unknown"]).describe("Whether walls or structure must change. Aangan does no structural work."),
  property_status: z.string().nullable().describe("empty / occupied / possession date / bare shell."),
  timeline_text: z.string().nullable().describe("The caller's own words about timing."),
  ready_by_date: z.string().nullable().describe("YYYY-MM-DD the project must be FINISHED or moved into. Null if the caller gave no deadline. A possession date is NOT a deadline."),
  can_start_after_date: z.string().nullable().describe("YYYY-MM-DD if the caller says they could start later instead (e.g. 'after Diwali', 'November')."),
  owner_status: z.enum(["owner", "tenant", "on_behalf", "unknown"]),
  decision_maker_confirmed: z.boolean().nullable().describe("true if the caller decides or is authorised; false if clearly only researching for others; null if not discussed."),
  budget_volunteered_inr: z.number().nullable().describe("The maximum budget in rupees ONLY if the caller volunteered a number. Never infer one."),
  referral_source: z.string().nullable(),
  is_vip_referral: z.boolean().describe("true only if referred by a close friend or associate of the studio's founder, Nikhil."),
  price_asked: z.boolean(),
  language: z.enum(["en", "hi", "mixed", "other"]),
  summary: z.string().describe("Two plain sentences for the designer. Refer to 'the caller'; never use names or phone numbers."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
