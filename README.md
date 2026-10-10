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
3. Notify and claim: email, claim lock, owner written to HubSpot, timeout auto-assign
4. Thin console + manual HubSpot report guide
5. Voice agent pack for Vaani
6. Deploy and end-to-end demo
