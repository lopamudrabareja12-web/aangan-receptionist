# MESA Case 03 — Aangan Studio: Unanswered Enquiries (phone only)

Course: MESA "AI and its Application", Cohort C4. Builder: Lopa. Status: PLANNING (Components Map + Nine Checks drafted in chat; build not started).
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

## Still open
- HubSpot: Lopa was told "we are supposed to use HubSpot for something". HubSpot appears nowhere in the problem statement, lecture decks, or source files read so far. Source unknown (professor/friend/Vaani?). Options: (A) HubSpot as CRM of record, (B) Supabase+dashboard primary with a one-way sync of leads to HubSpot contacts/deals, (C) skip. Do not build until Lopa confirms where the requirement comes from.
- Real-time booking vs "request a slot, designer confirms". Proposed: request.
- After-hours leads: queue designer alerts until working hours; agent tells caller when to expect a callback.
- Confirm voice platform (VaaniYantra vs other) and where the phone number comes from; Marathi unsupported/unknown.
- Resend free tier may only send to verified addresses/domain; fine for demo with test addresses.
- Confirm the Cut (pricing quote).
