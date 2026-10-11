# MESA Case 03 — Aangan Studio: Unanswered Enquiries (phone only)

Course: MESA "AI and its Application", Cohort C4. Builder: Lopa. Status: BUILDING. Phases 1, 2A, 2B and 3 (notify + claim) built and live-tested; next: a real Vaani payload and test call, Phase 4 console, Phase 5 voice pack.
Update the "Decisions" section below as choices are made. Never put API keys in this file.

## The case in brief
- Founder: Nikhil Deshpande, Aangan Studio (interior design, Pune; 60 people, 14 designers). Avg project Rs 8-14 lakh.
- ~200 enquiries/month over phone, WhatsApp, web form. Front desk = 2 people, 10am-7pm. ~33% arrive outside those hours.
- ~48% get no response within 48 hrs. Answered <1 hr converts 4x vs next day.
- Designers receive forwarded messages with no context and re-ask what the front desk already asked.
- Nikhil's ask: (1) every enquiry answered in 5 min, day or night; (2) worthwhile ones reach designers with everything already asked; (3) system quotes standard per-sq-ft pricing.
- SCOPE: incoming PHONE CALLS ONLY. WhatsApp and web form are NOT built; only note in the write-up how the solution extends to them.
- I (the builder) must: own the build and justify choices; choose handoff channel Telegram vs email and justify; build a dashboard showing what the system costs to run AND what it generates (incl. the dashboard tool's own cost) so Nikhil never pulls numbers by hand again.

## Deliverables due (prof allowed submission 10 Oct)
1. Automation Brief: Why (Pain, User, Outcome) + Journey Today map.
2. Nine Checks with case evidence; identify THE CUT.
3. Components Map: Trigger -> Input -> Context -> Processing -> AI -> Output.
Then: build (Claude Code) -> test -> deploy -> dashboard.

## Source files (in ./source)
- enquiries.txt: 40 transcripts (T01-T19/T20 phone, W01-W10 WhatsApp, F01-F10 web form). Only the T-series is in scope for the build; W/F are useful as extra test cases.
- services.md: what the studio does/doesn't do. Service area = Pune city + PCMC. Commercial up to ~3,000 sq ft; no restaurants/hotels/retail/gyms; no standalone advice/styling/furniture sourcing; min engagement = room redesign with execution.
- qualified.md: Nikhil's 5-criterion rubric (real project, in service area, realistic timeline 8-10 wks, budget band only if volunteered, decision-maker present/represented). Rules: unclear on 1/2/3 -> ask ONE direct question; unclear on 4/5 -> do not push, treat as qualified, note uncertainty; two or more fail -> decline gracefully; volunteered clearly-too-low budget -> note, do not forward. Does NOT disqualify: not knowing what they want, after-hours calls, asking for pricing, unsure on materials/style, single room, rented flat (no structural change).
- pricing.md: indicative only. The agent must NEVER state any number/range/per-sq-ft. Only allowed reply: "Pricing depends on the site, the materials you choose, and the scope - your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like."
- problem_statement.pdf: original brief.

## Evidence found in the phone transcripts (use in the briefs)
- After-hours/missed: T08 (10:47pm missed call, no voicemail, callback next morning unanswered).
- Lost lead from no note taken: T16 (called Monday, nobody followed up, re-logged Friday, caller frustrated).
- Line dropped, caller had to call back: T17 (dedupe by phone number).
- Existing-client complaint, must NOT be treated as a new enquiry, escalate to Nikhil/senior: T09.
- Pricing asked: T02, T13 -> deflected, caller still booked ("fair enough, let's book it"). Evidence the deflection works.
- Clean qualifies: T01, T05, T06, T11 (rented, no structural), T12 (5,500 sq ft villa), T15, T17b, T20.
- Declines: T03 (Nashik, out of area), T04 (advice only), T10 (budget Rs 1-1.5L for kitchen+bedroom), T19 (restaurant), T07 (3 weeks to Diwali; offered Nov start), T18 (180 sq ft coworking pod).
- On behalf of someone: T14 (son calling, parents decide and will attend; front desk noted it).
- Also W/F set: Hinglish message (W03) -> voice agent should cope with Hindi/English mix; F-series has volunteered budgets (F03 Talegaon, F08 3-week deadline) good for rule tests.

## Inconsistencies in the source to resolve (ask Nikhil / decide)
- T18: front desk said commercial minimum is ~500 sq ft; services.md states no minimum (only a 3,000 sq ft cap). Treat as "unclear -> forward with flag" unless Nikhil says otherwise.
- Timeline: qualified.md says site ready within 8-10 wks of consultation; services.md says cannot start if ready in <6 wks from today. Use qualified.md as the rule (Nikhil: "use this to decide"), note the 6-week floor.
- Nine Checks numbering differs between decks. Use the latest version (Lecture 4 / Case 3 slide): 01 Problem real, 02 Workflow repeated, 03 Input available | 04 Output valuable, 05 Impact measurable, 08 ROI worth it | 06 Failure risk OK, 07 Judgment protected, 09 Owner clear.
- The problem statement's "Arjun" in task 2 is a template typo for Nikhil.

## Course stack pattern (from Lectures 2-4; reuse unless there is a reason not to)
Claude Chat designs rules (no code) -> Claude Code builds -> Gemini Flash for AI steps (billed API, not free tier: free tier may train on inputs) -> Supabase (records) -> Vercel (live dashboard) -> GitHub (push at end of every session). Telegram used in Case 1 for notes in/drafts out. Resend for email in Case 2. Voice platform for this case: Vaani (invite codes were issued by MESA; do not copy codes anywhere).
Security rules: keys only in .env / .env.local; .env in .gitignore BEFORE first push; add same keys to Vercel dashboard manually; rotate immediately if leaked. Privacy pattern from Case 2: strip personal details before AI calls where possible.
Rule of thumb: start with the cheapest model that does the job.
Course convention: DONE WHEN criteria per checkpoint; push to GitHub at the end of every session.

## DRAFT Components Map (phone only) - see chat for discussion; update after decisions
| Column | What |
|---|---|
| Trigger | Incoming call to the studio number, any hour. |
| Input | Live caller speech (transcribed), caller number, timestamp. |
| Context | services.md (scope), qualified.md (rubric + boundary rules), the single pricing-deflection line (NO pricing numbers loaded at all), previous record for that phone number (dedupe/callback). |
| Processing | Conversation loop collects: name, number, location, property type, scope, size, timeline, owner/decision-maker, budget only if volunteered. Classify call: new enquiry / existing-client complaint / out of scope / pricing-only. Apply rubric: qualify, ask one question, decline gracefully, or escalate. Post-call: structured extraction + store. |
| AI | (1) Live voice conversation on Vaani. (2) Post-call extraction, rubric verdict, handoff-note drafting (Gemini Flash). |
| Output | To caller: answered instantly, consultation booked or graceful close. To designers: handoff note by EMAIL (Resend) to all on-duty designers, with a link to the lead page on the dashboard where one claims it (decided 10 Oct; replaces Telegram). To Nikhil: dashboard (calls, response time, qualified/declined with reasons, bookings, cost per call, est. pipeline). Record in Supabase. Complaints -> immediate escalation. |

## DRAFT Nine Checks - see chat; summary
01 Problem real YES | 02 Workflow repeated YES | 03 Input available YES | 04 Output valuable YES | 05 Impact measurable YES | 06 Failure risk OK: YES for answering/capturing/handoff, NO for quoting prices | 07 Judgment protected YES (designer owns design + pricing; humans take complaints) | 08 ROI YES (needs Nikhil's baseline conversion %) | 09 Owner clear: YES for handoff, NO for price quotes (no accountable person).
THE CUT (proposed): "quote our standard per-sq-ft pricing" - killed by checks 06 + 09 (and pricing.md forbids it). Built instead: warm deflection + book the consultation (T02, T13 show callers still book).
Second risk to design carefully: auto-DECLINE (like Case 2 auto-reject: a wrongly declined caller is invisible). Proposal: AI declines only on hard fails (service area, out-of-scope type, advice-only); soft criteria (timeline, budget, decision-maker) forward with a flag; every decline logged with transcript on the dashboard for review.

## DATA STATUS (important for the build)
The 40 transcripts are HISTORICAL enquiries handled by the human front desk in Sept 2026. They are NOT outputs of this system. Use them as: (1) baseline evidence of the pain, (2) a replay test suite with expected outcomes (e.g. T03 decline, T13 qualify + price deflection), (3) optional demo seed data that must be labelled "historical replay" and never mixed into live metrics, and (4) examples that teach the agent the style of real conversations. Note (4) is NOT model training/fine-tuning: it means putting representative calls into the agent's prompt/knowledge as few-shot examples (a friend of Lopa's reads the seed data as "training data"; that is fine in spirit, but implement it as examples + rules). KEEP A HOLDOUT SPLIT: use roughly half the calls as prompt examples and keep the rest unseen for testing, otherwise the replay test only proves the agent memorised them. Also test with calls NOT in the data (angry caller, Hinglish, interruptions, silence, dropped line).

## Findings from the 20 phone calls (human desk behaviour)
- 19 answered call records: 11 went forward, 5 declined (T03, T04, T10, T18, T19), 1 deferred (T07), 2 not new enquiries (T09 complaint, T16 lost follow-up); T08 missed after hours.
- Of the 11 that went forward: sq ft missing in 2, timeline missing in 3, decision-maker not confirmed in ~5 -> designers re-ask. The agent must ask the same must-have fields every time.
- Pricing asked in T02, T13; callers pushed twice for a range; both still booked after a deflection that gave a reason + "consultation is free, no obligation" + a next step. Do not use T13's "3x" claim unless Nikhil approves.
- Honest, reasoned declines were received well ("thank you for being straight"). Declines should give a reason, no blame, an alternative, and leave the door open.
- Warm leads dropped: T04, T07 (Nov start feasible). Add a Deferred status with a revisit date.
- Caller ID gives the number automatically, incl. dropped calls (T17). Every call becomes a record.
- Referral source volunteered in T01, T02, T03, T05 but never asked. Agent asks "how did you hear about us?"; flag named friends of Nikhil as VIP.
- Failures are not only after-hours: T16 shows a lead lost for 5 days after a verbal promise.
- Language: all 20 phone transcripts are English; Hinglish only in W03 (WhatsApp); no Marathi seen. Build English + Hindi; Marathi = stated extension. Marathi support for Vaani unconfirmed.
- Avg call leg ~4.6 min -> ~Rs 23/call at Rs 5/min (VaaniYantra public docs; confirm). Assuming ~half of 200 enquiries are calls -> ~Rs 2,300/month voice cost before carrier + hosting.

## Market research (limited; be honest in the write-up)
- DesignCafe: first-contact form asks property type + location; budget comfort is discussed at the designer consultation ("not about selling, it's about listening"). Supports Nikhil's "don't probe on budget".
- Livspace (secondary blog, indicative): consultation + site survey wk 1-2 (fee often waived), final quotation after material selection (~wk 4-6).
- Large firms run human pre-sales teams that schedule meetings and keep CRM records. That layer is what this system automates.
- Could NOT confirm that big firms ask budget early; found nothing usable on HomeLane or response-time targets. Do not claim otherwise.

## Mom's (architect's) input, evaluated
Scope questions: must-ask on the call = building type, carpet area, whole vs part (which rooms), furniture design needed (custom/sourced vs own), storage/wardrobe/kitchen needs, any structural/civil work (Aangan does none -> real filter), property status (empty/occupied/possession date), timeline, owner/decision-maker, location. Capture-if-volunteered = walls, colours, style, customisations, referral source, budget. Leave to consultation = finishes, materials, style (qualified.md: not knowing what they want must not disqualify). Keep calls near 4-7 min: let the caller talk, ask only for missing must-haves.
Status pipeline (adopted): New (qualified) -> Claimed -> Designer called back -> Site visit approved -> Visit scheduled -> Visit done -> Quotation pending -> Quotation sent -> Won / Lost (reason). Side lanes: Deferred (revisit date), Declined (auto, review queue), Escalation (complaint/VIP), Incomplete call. One-tap updates, stuck-stage flags, quotation stays human (consistent with the Cut). Order of visit vs quote may be configurable (Livspace quotes after design).

## Decisions (confirmed by Lopa, 10 Oct 2026)
- Handoff channel: EMAIL, not Telegram. All on-duty designers get an email with the lead summary and a link; they open the dashboard and claim it. If unclaimed after a timeout, it is auto-assigned at random among available designers (suggested refinement, to confirm: prefer the designer with fewest open leads). Timeout length TBD (suggest ~15 min in working hours). Unclaimed/hot/VIP/complaint leads also alert Nikhil. Dashboard is the single place of record.
- Lead value on dashboard: average project value (midpoint of Rs 8-14 lakh) x qualified leads, labelled an estimate.
- ROI: break-even framing + an editable conversion-rate input on a settings panel.
- Assignment: claim-first + escalation.

## Also confirmed by Lopa (10 Oct 2026)
- THE CUT: the system never quotes prices. Warm deflection + book the consultation.
- Who answers: the AI picks up every call, with a human route for complaints (existing-client complaints escalate to Nikhil/senior).
- Auto-decline: only on hard fails (outside Pune/PCMC, out-of-scope project types, advice-only, structural-only). Everything else is forwarded to a designer with a flag. Every decline is logged with its transcript for Nikhil to review.

## HubSpot (REQUIRED) - added 10 Oct 2026, supersedes earlier "skip HubSpot" notes
Context from Lopa: the founder already uses HubSpot and does NOT want many dashboards, so HubSpot is his primary workspace and everything must be connected to it. Our own dashboard is for designers and the front desk/receptionist (operational use); the founder has access but should not need it day to day.
Design principle: ONE SOURCE OF TRUTH PER FACT. No two-way syncing of the same state.
- HubSpot owns: contacts (callers), deals (leads) and their pipeline stage, deal owner (designer), tasks (callbacks, visit follow-ups, revisit dates), notes (handoff note, flags, referral source, transcript summary/link), and the founder's reports/dashboard.
- Our app (Supabase + Next.js) owns: raw calls and full transcripts, webhook idempotency, extraction audit, rubric decisions, costs, Replay Lab + historical seed data, sync log, and a thin operational console (claim link/page, leads view that READS stage/owner live from HubSpot, declined review queue, replay lab, cost detail).
Mapping: caller -> Contact (match/dedupe on phone). Lead -> Deal in an "Aangan Enquiries" pipeline with stages: New (qualified), Claimed, Designer called back, Site visit approved, Site visit scheduled, Site visit done, Quotation pending, Quotation sent, Closed won, Closed lost. Deferred / Declined (review) / Escalation / Incomplete call must also be visible in HubSpot (extra stages or a second pipeline, depending on plan limits). Designer -> HubSpot owner. Claim or auto-assign -> sets the deal owner via API. Handoff note -> a note on the deal plus key fields as properties. Revisit dates and callbacks -> HubSpot tasks. Per-call cost and cost per qualified lead -> pushed into HubSpot so the founder sees cost and value together (verify custom-property limits on the free plan; fall back to notes if needed and tell Lopa).
Integration rules: private-app access token in .env.local (HUBSPOT_ACCESS_TOKEN); idempotent upserts (store hubspot contact/deal ids); retry with backoff and respect rate limits; a failure queue so a HubSpot outage never loses a call; a resync button; sync log table. Historical/replay data is tagged and kept out of the live pipeline unless Lopa confirms. Check HubSpot's CURRENT API docs and the account's plan limits before building; do not assume.

## Rule conflict flagged (decided in the build prompt)
Lopa confirmed "forward soft fails with a flag", but Nikhil's rubric (qualified.md) says a clearly-too-low VOLUNTEERED budget is not forwarded (T10). Build prompt follows Nikhil's rubric for that one case: log to the Declined review queue, never forward. T18 (180 sq ft pod): forward with flag even though the human desk declined. Lopa to confirm.

## HubSpot decisions (confirmed by Lopa, 10 Oct 2026)
- Designers as users: use ~3 test HubSpot users for the demo; the write-up must say a real rollout needs paid seats. Use a custom "designer name" property ONLY if the account truly blocks extra users (it weakens "one place").
- Side lanes (Deferred, Declined review, Escalation, Incomplete call) are extra stages in the SAME pipeline ("Aangan Enquiries"). Free plan allows one pipeline, so setup may adopt the EMPTY default pipeline (--adopt-default). Side lanes use 1% probability so HubSpot does not treat them as closed-lost.
- Deal amount: the Rs 11 lakh average, ONLY for qualified leads, labelled an ESTIMATE in the deal description; the designer replaces it with the real quote.
- Replay data stays OUT of HubSpot. Replay Lab runs against a mock HubSpot.
- Custom deal properties kept to 6 (free plan allows ~10 in total; confirm in Usage & Limits). VIP uses the standard hs_priority field.
- Reports cannot be created by the HubSpot API: Nikhil's reports/dashboard are built by hand in the HubSpot UI (a click-by-click guide will be written in Phase 4).
- HubSpot has no atomic "first claim wins": Phase 3 uses a short-lived claim lock in Supabase, then writes the owner to HubSpot. The lock is coordination only, not a second copy of ownership.

## Pipeline decisions made while building Phase 2B (Lopa to confirm)
- Rubric thresholds live in src/lib/pipeline/rubric.ts (DEFAULT_RUBRIC): clearly-too-low volunteered budget = under Rs 3 lakh (any scope with execution; qualified.md's own example is Rs 1-1.5 lakh for a flat) ; finish deadline under 6 weeks = Deferred (revisit on the date the caller offered, else +8 weeks); 6-8 weeks = forwarded with "timeline_tight"; commercial under 500 sq ft = forwarded with a flag (T18); over 3,000 = flagged. A possession date is not a deadline (T15).
- Prompt-example vs held-out split: examples T01,T02,T03,T06,T07,T09,T10,T12,T19,T20; held out T04,T05,T08,T11,T13,T14,T15,T16,T17,T18 (src/replay/split.ts).
- Privacy: phone numbers, emails and the caller's OWN name are removed before Gemini. Names of other people (a referrer, a designer) are not, because the referral source is a field we need. Lopa to decide if that is acceptable.
- The handoff note is a deterministic template (identifiers merged after the AI step), not AI-drafted: more reliable and keeps identifiers out of Gemini.
- Dedupe: a dropped call's HubSpot write is held 10 minutes; a redial from the same number within that window cancels it (T17).
- Missed calls (T08): the voice agent should answer all calls, so these are rare; a transcript with under 15 caller words is treated as incomplete and gets a callback task, with no AI cost.
- Vaani webhook payload and signature scheme are ASSUMED (fixtures/vaani/FAKE-sample-call.json, src/lib/vaani/*). Only those files change when a real sample is available.

## HubSpot status (10 Oct 2026)
- Test portal created (free plan, Hub ID 247653838). Limits found: 2 users max; legacy private apps unavailable, a SERVICE KEY is used instead (works as a Bearer token).
- `npm run hubspot:setup -- --apply --adopt-default` has been applied: the default pipeline was renamed "Aangan Enquiries" with our 14 stages; 6 custom deal properties created. Side-lane stages at 1% probability are confirmed OPEN (isClosed=false).
- Designers: only 1 more user can be added on the free plan, so the demo has 2 HubSpot owners.

## Gemini on the FREE tier (decided by Lopa, 10 Oct 2026; reverses the earlier "billed API" rule)
- Why it matters: Google may use free-tier prompts and responses to improve its products. Acceptable ONLY because the demo and Replay Lab use anonymised historical transcripts and test calls.
- Still true: phone numbers, emails and the caller's own name are stripped before any Gemini call (src/lib/pipeline/redact.ts).
- Before any REAL caller data goes through, switch the project to the paid tier (link a billing account in AI Studio) and say so in the write-up.
- Free tier has low rate limits and may be slower; the replay is throttled and retries on rate-limit errors.

## Gemini results (10 Oct 2026)
- Model: `gemini-3.5-flash-lite` (the cheapest Flash model offered to this account; gemini-2.5-flash-lite is closed to new users). Listed price about $0.30 in / $2.50 out per 1M tokens (third-party sources; confirm on Google's page). Measured: about 570 input + 350 output tokens per call, roughly Rs 0.09 per call at those rates; Rs 0 on the free tier.
- Real extraction replay on the 20 historical calls: first run 19/20 (all 10 held-out calls passed; T07 missed because the model did not turn "before Diwali, about three weeks away" into a deadline). After a generic prompt fix about relative dates, 20/20 (10/10 prompt-example calls, 10/10 held-out calls). Caveats: n = 20, single run, model output can vary between runs; the prompt fix was made while looking at T07 (an example call), the held-out calls were not used for tuning.

## Public repo decision (Lopa, 10 Oct 2026)
- The GitHub repo is PUBLIC for submission and still contains source/pricing.md (internal pricing guide) and the anonymised transcripts. Lopa decided to leave them. The Cut still holds: no pricing number appears in the app, the AI prompt, the site or the voice-agent pack (tests check this).

## Phase 3 status (11 Oct 2026)
- Live: Resend emails, claim page and API, first-claim-wins, auto-assign after 15 working minutes, Nikhil alerts, fast webhook reply, sweeper, and an every-minute Supabase pg_cron job ('aangan-tick') calling /api/cron/tick on Vercel. All env vars are set on Vercel.
- Only ONE HubSpot user exists (the free plan allows 2), so the single designer is Lopa herself; Nikhil's alert address is the same inbox. Resend's test sender delivers only to the account owner's address.
- The timer secret appeared in a screenshot shared in chat; rotate CRON_SECRET (.env.local, Vercel, re-run the cron SQL) before real use.

## Vaani webhook: real format captured (11 Oct 2026)
- Where: Vaani dashboard > Developers > Webhooks > "New End Point" (Agent Webhook tab); not under Settings. Fields: name, endpoint URL, optional signing secret, agents, events (+ "Send all call details" under Call Post-Processing). "Test Connectivity" sends a `webhook_test` bundle of all 11 events.
- Headers: `x-webhook-event`, `x-webhook-signature: sha256=<hex>` where hex = HMAC-SHA256(secret, exact raw body). No timestamp header. VERIFIED by recomputing the signature of a captured request.
- Each event: { event, timestamp, data: {...} }. call_started has phone_number + call_type (the caller's number for Inbound); call_postprocessing (top-level call_id too) has transcript ("Agent: ...\nUser: ..."), call_duration, summary, entities, dispositions, recording_url but NO number or start time -> we store call_started in vaani_call_meta and join.
- CONFIRMED on a real call (12 Oct 2026, 01:2x IST): post-call event DOES carry phone_number, call_type, call_started_at, plus top-level `to`/`from`; transcript lines are "[HH:MM:SS] AGENT: ..." / "[..] USER: ..." (Devanagari text passes through); call_duration is decimal SECONDS (93.43) so it is rounded for the integer column; call_id == room_name (format outbound-<epoch>-<hex>); entities are whatever the agent's Analysis tab defines (caller_name, project_size, ...). Vaani also adds summary, dispositions, conversation_quality, recording_url.
- "Start Test > Audio" in the Vaani dashboard places an OUTBOUND call to the user's own phone (it asked for a number); real inbound calls need a Vaani inbound number (Deploy tab > Inbound Phone Number; none provisioned yet). One webhook per agent only. Secret goes into the Secret box of the Edit Webhook form; the Vaani test call that 401'd was caused by an unreplaced secret.
- Real-call evidence: speech-to-text mangled some words ("3 BHP", "Fourteen 300 feet") but the pipeline still produced a correct lead (Kothrud, 1,400 sq ft, March 2027, owner). The test agent's prompt only asks name/type/location/size; the real prompt (Phase 5) must ask all must-have fields.
- Lead from that call is in HubSpot (deal "Priya · 3BHK apartment · Kothrud") and waits for the 10:00 IST designer email (after-hours rule).
- Our endpoint: POST https://aangan-receptionist-beta.vercel.app/api/webhooks/vaani with the secret in VAANI_WEBHOOK_SECRET.

## Still open
- HubSpot account: which plan, and its real limits (users, custom properties, dashboards). Lopa to paste Usage & Limits.
- Real-time booking vs "request a slot, designer confirms". Proposed: request.
- After-hours leads: queue designer alerts until working hours; agent tells caller when to expect a callback.
- Confirm voice platform (VaaniYantra vs other) and where the phone number comes from; Marathi unsupported/unknown.
- Resend free tier may only send to verified addresses/domain; fine for demo with test addresses.
- Confirm the Cut (pricing quote).
