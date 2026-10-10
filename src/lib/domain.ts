// Single source of truth for enum values shared with the database.
// tests/db/migrations.test.ts checks these against supabase/migrations/0001_init.sql.

export const CALL_STATUSES = ["received", "processing", "processed", "failed"] as const;
export const OWNER_STATUSES = ["owner", "tenant", "on_behalf"] as const;

export const DECISIONS = [
  "qualified",
  "qualified_flagged",
  "declined",
  "deferred",
  "escalation",
  "incomplete",
] as const;

// Main pipeline, in order.
export const PIPELINE_STAGES = [
  "new_qualified",
  "claimed",
  "designer_called_back",
  "site_visit_approved",
  "site_visit_scheduled",
  "site_visit_done",
  "quotation_pending",
  "quotation_sent",
  "won",
  "lost",
] as const;

// Side lanes outside the main pipeline.
export const SIDE_LANES = ["deferred", "declined", "escalation", "incomplete_call"] as const;

export const STAGES = [...PIPELINE_STAGES, ...SIDE_LANES] as const;

export type CallStatus = (typeof CALL_STATUSES)[number];
export type OwnerStatus = (typeof OWNER_STATUSES)[number];
export type Decision = (typeof DECISIONS)[number];
export type Stage = (typeof STAGES)[number];

export const TIMEZONE = "Asia/Kolkata";
