// The Components Map: Trigger -> Input -> Context -> Processing -> AI -> Output, for the phone-only build.
// One source for the website home page and docs/components-map.md.

export type Status = "built" | "planned" | "assumed";

export interface MapItem {
  text: string;
  status: Status;
}

export interface MapColumn {
  key: string;
  title: string;
  summary: string;
  items: MapItem[];
}

export const COMPONENTS_MAP: MapColumn[] = [
  {
    key: "trigger",
    title: "1. Trigger",
    summary: "What starts the workflow",
    items: [
      { text: "A caller dials Aangan Studio's number, at any hour. A Vaani voice agent answers every call (English and Hindi).", status: "assumed" },
      { text: "When the call ends, Vaani sends a signed end-of-call webhook (call_postprocessing) to POST /api/webhooks/vaani.", status: "built" },
    ],
  },
  {
    key: "input",
    title: "2. Input",
    summary: "What comes in",
    items: [
      { text: "Full call transcript (AGENT / USER lines), call id, duration, end reason, recording link.", status: "built" },
      { text: "Caller's number and start time: not in the post-call event, so they come from the earlier call_started event or Vaani's call API (to be confirmed with a real test call).", status: "assumed" },
    ],
  },
  {
    key: "context",
    title: "3. Context",
    summary: "What the system knows",
    items: [
      { text: "services.md: service area (Pune city + PCMC), project types in and out of scope.", status: "built" },
      { text: "qualified.md: Nikhil's 5-criterion rubric and what does NOT disqualify (after-hours calls, price questions, rented flats, single rooms).", status: "built" },
      { text: "The ONE allowed pricing reply. No pricing numbers are loaded anywhere: pricing.md never reaches the agent, the AI or the code.", status: "built" },
      { text: "Earlier calls from the same number in the last 10 minutes (dropped-call dedupe).", status: "built" },
      { text: "Settings: average project value, per-minute voice rate, AI token rates.", status: "built" },
    ],
  },
  {
    key: "processing",
    title: "4. Processing",
    summary: "What the code does, in order",
    items: [
      { text: "Verify the signature; store the call once (idempotent on the call id, so retries never duplicate).", status: "built" },
      { text: "Remove phone numbers, emails and the caller's own name before any AI call.", status: "built" },
      { text: "Apply Nikhil's rubric in plain, unit-tested code (no AI): qualified, qualified with flags, declined (with reason), deferred (with revisit date), escalation, or incomplete.", status: "built" },
      { text: "Dedupe a dropped call followed by a redial; compute per-call cost; queue the CRM write with retries so a HubSpot outage never loses a call.", status: "built" },
      { text: "Reply to Vaani within its 5-second limit, then process in the background; a sweeper re-runs any call that got stuck.", status: "built" },
    ],
  },
  {
    key: "ai",
    title: "5. AI",
    summary: "Where AI is used, and where it deliberately is not",
    items: [
      { text: "Live conversation: Vaani voice agent (Sarvam voice, English/Hindi/mixed).", status: "assumed" },
      { text: "After the call: Gemini 3.5 Flash-Lite turns the transcript into structured fields. The cheapest model that passed; 20 of 20 historical calls matched the intended outcome (10 of 10 held out).", status: "built" },
      { text: "NOT AI: the qualify / decline / escalate decision. It is code, so it is testable and predictable.", status: "built" },
    ],
  },
  {
    key: "output",
    title: "6. Output",
    summary: "What each person gets",
    items: [
      { text: "Caller: answered at once, any hour; no price ever quoted, a free consultation offered instead.", status: "assumed" },
      { text: "HubSpot (Nikhil's main workspace): a contact, a deal in the 'Aangan Enquiries' pipeline (estimated value on qualified leads only), a handoff note, and tasks (callback, revisit, urgent escalation).", status: "built" },
      { text: "Email (Resend): the on-duty designers get the handoff note and a claim link. First to claim becomes the HubSpot deal owner and confirms the visit; unclaimed after 15 minutes, it is auto-assigned and Nikhil is alerted. After-hours leads wait until 10:00 IST. Nikhil is also emailed on VIP, complaint and unclaimed leads. A background job runs every minute.", status: "built" },
      { text: "Founder: HubSpot reports for pipeline and cost vs value, plus a thin console for declined-lead review, costs and replay tests.", status: "planned" },
    ],
  },
];

export const THE_CUT = {
  asked: "\"The system should quote our standard per-square-foot pricing.\"",
  verdict:
    "Not built. It fails check 6 (failure risk) and check 9 (clear owner): a wrong or out-of-date number has no accountable person, and the pricing guide itself says nothing may be quoted. Instead the agent gives one warm deflection with a reason and books the free consultation. In the historical calls, both callers who pushed for a price still booked.",
};

export const STATUS_LABEL: Record<Status, string> = {
  built: "Built and tested",
  planned: "Planned",
  assumed: "Depends on Vaani (to confirm)",
};
