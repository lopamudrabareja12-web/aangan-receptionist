-- Phase 2B: what the post-call pipeline needs to store.

-- A pending HubSpot write can be cancelled (e.g. a dropped-call "incomplete" lead that a redial supersedes).
alter type outbox_status add value if not exists 'cancelled';

alter table leads
  add column extraction           jsonb,            -- de-identified model output: the extraction audit
  add column missing_fields       text[] not null default '{}',
  add column summary              text,
  add column price_asked          boolean not null default false,
  add column reason_code          text,             -- why the rubric decided what it did
  add column rubric_version       text,
  add column superseded_by_call_id uuid references calls(id);  -- dedupe: a redial within 10 minutes replaced this lead

alter table calls add column error text;          -- why processing failed (never contains secrets)
alter table hubspot_outbox add column hold_reason text;
