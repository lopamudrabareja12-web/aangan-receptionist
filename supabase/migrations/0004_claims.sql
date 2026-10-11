-- Phase 3: notify designers and let one of them claim the lead (first claim wins).
-- Who owns the deal lives in HubSpot; this table only coordinates the claim and the emails.

create type assignment_status as enum ('awaiting_notify', 'notified', 'claimed', 'auto_assigned');

create table lead_assignments (
  lead_id           uuid primary key references leads(id) on delete cascade,
  kind              text not null default 'claim' check (kind in ('claim', 'escalation')),
  status            assignment_status not null default 'awaiting_notify',
  notify_at         timestamptz not null,   -- when to email (10:00 IST if the call came after hours)
  notified_at       timestamptz,
  claim_deadline    timestamptz,            -- set when designers are emailed; then auto-assign
  designer_id       uuid references designers(id),
  claimed_at        timestamptz,
  via               text check (via in ('claim', 'auto')),
  nikhil_alerted_at timestamptz,
  subject           text not null,
  note_text         text not null,
  note_html         text not null,
  is_vip            boolean not null default false,
  created_at        timestamptz not null default now()
);
create index lead_assignments_due_idx on lead_assignments (status, notify_at);
create index lead_assignments_deadline_idx on lead_assignments (status, claim_deadline);

alter table lead_assignments enable row level security;
