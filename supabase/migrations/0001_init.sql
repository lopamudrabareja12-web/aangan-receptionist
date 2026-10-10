-- Aangan Studio phone receptionist: core schema (Phase 1)
-- All access goes through server code using the service-role key.
-- RLS is enabled with NO policies, so the anon key can read/write nothing.

create type call_status as enum ('received', 'processing', 'processed', 'failed');

create type owner_status as enum ('owner', 'tenant', 'on_behalf');

-- What the pipeline decided about the enquiry.
create type lead_decision as enum (
  'qualified', 'qualified_flagged', 'declined', 'deferred', 'escalation', 'incomplete'
);

-- Pipeline stages plus side lanes. 'lost' carries a reason in leads.lost_reason.
create type lead_stage as enum (
  'new_qualified', 'claimed', 'designer_called_back', 'site_visit_approved',
  'site_visit_scheduled', 'site_visit_done', 'quotation_pending', 'quotation_sent',
  'won', 'lost',
  'deferred', 'declined', 'escalation', 'incomplete_call'
);

create table designers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  on_duty     boolean not null default true,
  is_senior   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table calls (
  id              uuid primary key default gen_random_uuid(),
  vaani_call_id   text not null unique,          -- idempotency key for the webhook
  caller_number   text,
  started_at      timestamptz,
  duration_sec    integer,
  language        text,
  transcript      text,
  raw_payload     jsonb,
  is_historical   boolean not null default false, -- true = replay of a Sept 2026 human-handled call
  status          call_status not null default 'received',
  created_at      timestamptz not null default now()
);
create index calls_caller_started_idx on calls (caller_number, started_at desc);
create index calls_historical_idx on calls (is_historical);

create table leads (
  id                        uuid primary key default gen_random_uuid(),
  call_id                   uuid not null unique references calls(id) on delete cascade,
  name                      text,
  phone                     text,
  location                  text,
  property_type             text,
  carpet_area_sqft          integer,
  scope_summary             text,
  rooms                     text[],
  whole_or_partial          text,
  furniture_needed          text,
  storage_needs             text,
  structural_work           text,
  property_status           text,
  timeline_text             text,
  ready_by_date             date,
  owner_status              owner_status,
  decision_maker_confirmed  boolean,
  budget_volunteered        text,
  referral_source           text,
  is_vip                    boolean not null default false,
  flags                     text[] not null default '{}',
  decision                  lead_decision not null,
  decline_reason            text,                  -- reason code, e.g. out_of_area
  decline_detail            text,                  -- human-readable explanation
  revisit_on                date,
  stage                     lead_stage not null,
  lost_reason               text,
  designer_id               uuid references designers(id),
  claimed_at                timestamptz,
  handoff_note              text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index leads_stage_idx on leads (stage);
create index leads_decision_idx on leads (decision);
create index leads_designer_idx on leads (designer_id);

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger leads_set_updated_at before update on leads
  for each row execute function set_updated_at();

-- Audit trail of every stage change, claim and notification.
create table lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  event_type  text not null,       -- e.g. created, claimed, auto_assigned, stage_changed, email_sent, reinstated
  from_stage  lead_stage,
  to_stage    lead_stage,
  actor       text not null,       -- 'system', 'nikhil', or a designer id/name
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index lead_events_lead_idx on lead_events (lead_id, created_at);

-- Per-call running cost. Rates live in settings; amounts are stored at write time.
create table costs (
  id                 uuid primary key default gen_random_uuid(),
  call_id            uuid not null unique references calls(id) on delete cascade,
  voice_minutes      numeric(8,2) not null default 0,
  voice_cost         numeric(10,2) not null default 0,   -- INR
  llm_input_tokens   integer not null default 0,
  llm_output_tokens  integer not null default 0,
  llm_tokens         integer generated always as (llm_input_tokens + llm_output_tokens) stored,
  llm_cost           numeric(10,4) not null default 0,   -- INR
  created_at         timestamptz not null default now()
);

-- Single-row settings table (id is pinned to 1).
create table settings (
  id                       integer primary key default 1 check (id = 1),
  -- cost rates (all editable on the dashboard)
  voice_rate_inr_per_min   numeric(8,2)  not null default 5,        -- Vaani public docs; confirm
  gemini_input_usd_per_m   numeric(8,4)  not null default 0.30,     -- PLACEHOLDER: confirm current Google pricing
  gemini_output_usd_per_m  numeric(8,4)  not null default 2.50,     -- PLACEHOLDER: confirm current Google pricing
  usd_inr                  numeric(8,2)  not null default 85,       -- PLACEHOLDER: set a current rate
  resend_monthly_inr       numeric(10,2) not null default 0,
  hosting_monthly_inr      numeric(10,2) not null default 0,        -- Vercel + Supabase plans (the dashboard's own cost)
  -- behaviour
  claim_timeout_minutes    integer       not null default 15,
  working_hours_start      time          not null default '10:00',  -- Asia/Kolkata
  working_hours_end        time          not null default '19:00',
  -- ROI inputs
  conversion_rate          numeric(5,4)  not null default 0.10,     -- PLACEHOLDER: ask Nikhil for his baseline
  avg_project_value_inr    numeric(12,2) not null default 1100000,  -- midpoint of Rs 8-14 lakh
  updated_at               timestamptz   not null default now()
);

alter table designers   enable row level security;
alter table calls       enable row level security;
alter table leads       enable row level security;
alter table lead_events enable row level security;
alter table costs       enable row level security;
alter table settings    enable row level security;
