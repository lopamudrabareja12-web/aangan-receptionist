// The "Aangan Enquiries" deal pipeline. Stage state lives in HubSpot only.
// Probabilities are STARTING GUESSES so HubSpot's weighted pipeline report works; Nikhil can change them in HubSpot.
// Side lanes use 1% (not 0%) on purpose: HubSpot treats 0% as "closed lost", which would hide them from open views.

export const PIPELINE_LABEL = "Aangan Enquiries";

export type StageKey =
  | "new_qualified" | "claimed" | "designer_called_back" | "site_visit_approved"
  | "site_visit_scheduled" | "site_visit_done" | "quotation_pending" | "quotation_sent"
  | "won" | "lost"
  | "deferred" | "declined_review" | "escalation" | "incomplete_call";

export interface StageDef {
  key: StageKey;
  label: string;
  probability: number;
  lane: "pipeline" | "side";
}

export const STAGES: readonly StageDef[] = [
  { key: "new_qualified", label: "New (qualified)", probability: 0.1, lane: "pipeline" },
  { key: "claimed", label: "Claimed", probability: 0.15, lane: "pipeline" },
  { key: "designer_called_back", label: "Designer called back", probability: 0.2, lane: "pipeline" },
  { key: "site_visit_approved", label: "Site visit approved", probability: 0.3, lane: "pipeline" },
  { key: "site_visit_scheduled", label: "Site visit scheduled", probability: 0.35, lane: "pipeline" },
  { key: "site_visit_done", label: "Site visit done", probability: 0.45, lane: "pipeline" },
  { key: "quotation_pending", label: "Quotation pending", probability: 0.5, lane: "pipeline" },
  { key: "quotation_sent", label: "Quotation sent", probability: 0.6, lane: "pipeline" },
  { key: "won", label: "Closed won", probability: 1.0, lane: "pipeline" },
  { key: "lost", label: "Closed lost", probability: 0.0, lane: "pipeline" },
  { key: "deferred", label: "Deferred (revisit)", probability: 0.01, lane: "side" },
  { key: "declined_review", label: "Declined (review)", probability: 0.01, lane: "side" },
  { key: "escalation", label: "Escalation", probability: 0.01, lane: "side" },
  { key: "incomplete_call", label: "Incomplete call", probability: 0.01, lane: "side" },
];

export const stageByKey = (key: StageKey): StageDef => {
  const s = STAGES.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown stage key: ${key}`);
  return s;
};
