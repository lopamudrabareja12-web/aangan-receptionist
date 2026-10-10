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
5. No HubSpot unless confirmed.
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

## Build phases

1. Foundation (this commit): scaffold, schema, seed, env template
2. Pipeline: webhook, extraction, deterministic rubric, Replay Lab
3. Notify and claim: email, atomic claim, timeout auto-assign
4. Dashboard
5. Voice agent pack for Vaani
6. Deploy and end-to-end demo
