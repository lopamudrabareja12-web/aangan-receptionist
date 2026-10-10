-- HubSpot is the single source of truth for lead stage and owner (designer).
-- This migration removes that state from Supabase and adds what we need to talk to HubSpot safely.

-- Audit trail keeps free-text stage names (stages now live in HubSpot, not in a Postgres enum).
alter table lead_events
  alter column from_stage type text using from_stage::text,
  alter column to_stage   type text using to_stage::text;

-- Columns dropping here also drops their indexes (leads_stage_idx, leads_designer_idx).
alter table leads
  drop column stage,
  drop column lost_reason,
  drop column designer_id,
  drop column claimed_at,
  drop column handoff_note;   -- the drafted note is sent to HubSpot as a Note; the payload is kept in the outbox
drop type lead_stage;

-- leads now = "what the system extracted and decided" (audit snapshot) + pointers into HubSpot.
alter table leads
  add column hubspot_contact_id text,
  add column hubspot_deal_id    text;
create unique index leads_hubspot_deal_idx on leads (hubspot_deal_id) where hubspot_deal_id is not null;

-- A designer maps to a HubSpot owner (user). On-duty and senior flags are ours: HubSpot has no such concept.
alter table designers add column hubspot_owner_id text unique;

-- Failure queue: every HubSpot write goes through here, so an outage never loses a call.
create type outbox_status as enum ('pending', 'done', 'dead');

create table hubspot_outbox (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text not null unique,          -- same logical write is never queued twice
  operation        text not null,                 -- e.g. upsert_contact, create_deal, add_note, create_task, set_owner
  lead_id          uuid references leads(id) on delete cascade,
  payload          jsonb not null default '{}',   -- never contains the access token
  status           outbox_status not null default 'pending',
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  created_at       timestamptz not null default now(),
  done_at          timestamptz
);
create index hubspot_outbox_due_idx on hubspot_outbox (status, next_attempt_at);

create table hubspot_sync_log (
  id           uuid primary key default gen_random_uuid(),
  outbox_id    uuid references hubspot_outbox(id) on delete set null,
  lead_id      uuid references leads(id) on delete set null,
  operation    text not null,
  ok           boolean not null,
  http_status  integer,
  detail       jsonb,
  created_at   timestamptz not null default now()
);
create index hubspot_sync_log_created_idx on hubspot_sync_log (created_at desc);

alter table hubspot_outbox   enable row level security;
alter table hubspot_sync_log enable row level security;
