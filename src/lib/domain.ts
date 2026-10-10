// Single source of truth for enum values shared with the database.
// tests/db/migrations.test.ts checks these against the SQL migrations.
// Pipeline stages are NOT here: they live in HubSpot (see src/lib/hubspot/stages.ts).

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

export type CallStatus = (typeof CALL_STATUSES)[number];
export type OwnerStatus = (typeof OWNER_STATUSES)[number];
export type Decision = (typeof DECISIONS)[number];

export const TIMEZONE = "Asia/Kolkata";
