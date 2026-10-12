# Aangan Studio: phone receptionist (post-call system)

An AI voice agent on **Vaani** answers every incoming call to Aangan Studio, day or night. This repo is
everything that happens **after** the call: a webhook receives the finished call, a pipeline extracts and
qualifies the enquiry, designers are emailed and claim leads, and Nikhil gets a dashboard of what the
system costs and what it generates.

Scope is **incoming phone calls only**. WhatsApp and the web form are not built.

> Decisions already made live in [CLAUDE.md](CLAUDE.md). Source material is in [source/](source/).

## Hard rules

1. **The Cut:** the system never states a price, range or per-sq-ft figure. `source/pricing.md` is
   reference only and is never imported by app code or copied into the voice-agent pack.
2. Auto-decline only on hard fails (outside Pune/PCMC, out-of-scope type, advice-only, structural-only),
   plus a clearly-too-low volunteered budget, which goes to a review queue. Every decline is logged with its transcript.
3. Existing-client complaints and lost follow-ups escalate to Nikhil; they are never new enquiries.
4. The 40 transcripts are **historical, human-handled** enquiries. They are test cases and demo data
   (`is_historical = true`), never mixed into live metrics.
5. **HubSpot is required and is the single source of truth** for contacts, deals, pipeline stage, deal owner (designer),
   tasks, notes and the founder's reports. Supabase never stores lead stage or owner.
6. Secrets only in `.env.local`. `.env.example` lists names only.
7. Gemini runs on the billed API, and personal identifiers (name, phone) stay out of Gemini inputs.
8. The UI is honest: pipeline value is an estimate, and costs come from configurable rates.

## Stack

Next.js (App Router, TypeScript) on Vercel · Supabase Postgres · Gemini Flash · Resend · GitHub.
INR formatting, Asia/Kolkata time, working hours 10:00 to 19:00 IST.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in values; never commit this file
npm run dev
```

### Database

Migrations are in `supabase/migrations/`, placeholder seed data in `supabase/seed.sql`.
Run them in order in the Supabase SQL editor (or with the Supabase CLI: `supabase db push`).
All tables have row level security on with no policies, so only the server (service-role key) can touch data.

### Checks

```bash
npm test          # unit tests; migration tests run the SQL in an in-process Postgres (PGlite)
npm run typecheck
npm run lint
npm run build
```

## HubSpot setup

1. Use a **separate/test HubSpot account**, not a live one.
2. Create a **service key** (new HubSpot accounts no longer have legacy private apps): Settings > Development > Keys > Service Keys > Create.
   Scopes: `crm.objects.contacts.read/write`, `crm.objects.deals.read/write`, `crm.objects.owners.read`,
   `crm.schemas.deals.read/write`, `crm.schemas.contacts.read`. A missing scope returns a 403 whose message names it.
   The service key is used exactly like the old private-app token (sent as a Bearer token); verified on a free account.
3. Put the key in `.env.local` as `HUBSPOT_ACCESS_TOKEN` (and the numeric hub id as `HUBSPOT_PORTAL_ID`). Never paste it
   anywhere else, and rotate it immediately if it is ever shown in a chat or screenshot.
4. Preview, then apply the pipeline and property setup:

```bash
npm run hubspot:setup                              # dry run, read-only
npm run hubspot:setup -- --apply --adopt-default   # free plan: reuse the EMPTY default pipeline
```

The setup is idempotent, never deletes anything, and refuses to rewrite a pipeline that already has deals.

## The post-call pipeline (Phase 2B)

`POST /api/webhooks/vaani` verifies the signature, then for each call: stores it (idempotent on the call id), removes
caller identifiers, asks Gemini to fill a structured record, applies Nikhil's rubric **in plain code**
(`src/lib/pipeline/rubric.ts`, unit-tested), and queues the HubSpot write (contact, deal, note, tasks) in an outbox with
retries so a HubSpot outage never loses a call.

Outcomes: qualified, qualified with flags, declined (with reason code, kept for review), deferred (with revisit date),
escalation (existing-client complaint or lost follow-up), incomplete (missed or dropped call).

**Assumptions to replace:** Vaani's real payload and signature format have not been seen. The adapter
(`src/lib/vaani/adapter.ts`) and signature check (`src/lib/vaani/signature.ts`) are written against an invented sample in
`fixtures/vaani/FAKE-sample-call.json`.

**Privacy limit:** phone numbers, emails and the caller's own name are removed before Gemini. Other people's names
(a referrer, a designer) are kept, because the referral source is a field we need.

### Replay Lab

Runs the 20 historical phone enquiries through the real pipeline with no phone and a **mock** HubSpot, and compares each
with the intended outcome. Calls are split into 10 prompt examples and 10 held-out calls.

```bash
npm run replay                         # offline, hand-labelled extractions: tests the rules and wiring
npm run replay -- --extractor=gemini   # BILLED: runs the real model (needs GEMINI_API_KEY and GEMINI_MODEL in .env.local)
```

The offline run does **not** measure Gemini's accuracy (the labels were written by hand from the same transcripts).
Only `--extractor=gemini` does. A page for the Replay Lab arrives with the console in Phase 4.

## Build phases

1. Foundation: scaffold, schema, seed, env template (done)
2. A. HubSpot foundation: slim schema, HubSpot client, setup script, deal mapping (done; real-portal smoke test pending)
   B. Pipeline: webhook, extraction, deterministic rubric, Replay Lab (built; Gemini and Supabase untested live)
3. Notify and claim: email via Resend, first-claim-wins link, owner written to HubSpot, 15-minute auto-assign, every-minute job (built and tested live)
4. Thin console + manual HubSpot report guide
5. Voice agent pack for Vaani (built: `voice-agent/`; follow `voice-agent/SETUP.md`)
6. Deploy and end-to-end demo (deployed on Vercel; see "How to demo" below)

## Notify and claim (Phase 3)

- A qualified lead becomes a HubSpot deal, then every on-duty designer linked to a HubSpot user gets an email with the handoff
  note and their own claim link. The link opens a page with a Claim button (a POST, so mail scanners cannot claim by accident).
  The first claim wins (one atomic database update), sets the HubSpot deal owner, moves New to Claimed and leaves a note.
- Unclaimed after 15 working minutes (10:00-19:00 IST): auto-assigned to the designer with the fewest open deals in HubSpot.
- Nikhil is emailed on VIP leads, complaints (at once), auto-assignments, and when no designer is on duty.
- After-hours leads wait until 10:00 IST.
- `POST /api/cron/tick` (secret required) runs every minute from a Supabase `pg_cron` job named `aangan-tick`: re-runs stuck calls,
  pushes queued writes to HubSpot, sends due emails, auto-assigns. To stop it: `select cron.unschedule('aangan-tick');`
- `npm run designers:sync -- --apply` links real HubSpot users as designers. `npm run phase3:smoke` and `npm run email:test` are live tests.
- Email uses Resend's test sender, which only delivers to the Resend account's own address. A real rollout needs a verified domain.

## Voice agent pack (Phase 5)

`voice-agent/` has everything to paste into Vaani: `prompt.md` (the system prompt, with five examples adapted from the
prompt-example half of the historical calls), `greeting.md`, five knowledge files, and `SETUP.md` (step by step, with eight test calls).
`tests/voice-agent.test.ts` guards it: no figure from the internal pricing guide, no currency symbols, the exact approved pricing reply,
the AI-and-recording greeting, one question at a time, every must-have field, the 15-minute complaint rule, and that no held-out call is used as an example.

## How to demo

Four calls show the whole system. There is no inbound phone number yet, so every call starts from **Vaani > Agents > aangan-test >
Start Test > Audio**, which rings the tester's own phone. Wait about two minutes after each call, then look in three places:
the **dashboard** (the Vercel link), **HubSpot > Deals** (pipeline "Aangan Enquiries"), and the **designer's inbox**.

Before you start: the designer must be on duty (`designers.on_duty`), and the every-minute `aangan-tick` job must be running.
Calls made outside 10:00-19:00 IST are held and their email is sent at 10:00 IST, which is the after-hours rule working, not a fault.

### 1. Happy path (run live: passed)

Say: "I want interior design for my 3BHK in Baner, about 1,150 sq ft, whole home. I'm the owner and I'd like it done by March."

- Agent: asks one question at a time, repeats the size back, summarises, says a designer will call during working hours.
- Result: a **qualified** lead and a HubSpot deal in New (qualified), marked as an estimate (Rs 11 lakh). Then the designer email with a claim link.
- Claim it: the first click wins, sets the deal owner in HubSpot and moves it to Claimed. Left alone for 15 working minutes, it is auto-assigned (run live: passed).

### 2. Price pressure (run live: passed)

Give normal details (for example Wakad, 900 sq ft), then ask "How much will it cost?" twice.

- Agent: gives a reason ("it varies a lot with the site and the materials") and offers the free, no-obligation consultation. It never says a number.
- Result: a qualified lead with the flag `price_asked`. The transcript contains no figure.

### 3. Out-of-area decline (verified in the replay, not yet run live)

Say: "I'm in Nashik" (anywhere outside Pune and PCMC).

- Agent: a kind decline with the reason and the door left open.
- Result: **declined, out of area**, with its transcript in the review queue for Nikhil. No designer email.

### 4. Complaint (verified in the replay, not yet run live)

Say: "My designer hasn't replied in five days."

- Agent: one apology, takes name, project area and designer, and says a senior person will call back within fifteen minutes.
- Result: an **escalation**, never treated as a new enquiry. Nikhil is emailed at once.

### Without a phone

`npm run replay` runs the 20 labelled historical calls (10 used as prompt examples, 10 held out) through the pipeline and prints the match rate.
These are historical, human-handled enquiries, so they are kept out of the live metrics and out of HubSpot.
`npm run replay -- --extractor=gemini` measures Gemini's real accuracy (last run: 20/20, 10/10 on the held-out half).

### What is not part of the demo yet

The Phase 4 console (declined-review queue, sync health, designer on-duty toggle) is not built. Gemini is on the free tier and Resend uses its
test sender, so use test data only until both are upgraded.
