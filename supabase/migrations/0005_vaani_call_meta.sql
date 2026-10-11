-- Vaani's end-of-call event carries no caller number or start time; its earlier call_started event does.
-- We keep that small record so the post-call event can be matched to the caller.
create table vaani_call_meta (
  call_id      text primary key,        -- Vaani's call id
  room_name    text,
  phone_number text,                    -- the other party's number (the caller, for an inbound call)
  call_type    text,                    -- Inbound / Outbound
  agent_name   text,
  started_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index vaani_call_meta_room_idx on vaani_call_meta (room_name);
alter table vaani_call_meta enable row level security;
