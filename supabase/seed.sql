-- Placeholder seed data. Emails use the reserved .invalid TLD so nothing can ever be delivered to them.
-- Replace with real designers (via the dashboard or SQL) before going live.

insert into designers (name, email, on_duty, is_senior) values
  ('Demo Designer A (placeholder)', 'designer-a@example.invalid', true,  false),
  ('Demo Designer B (placeholder)', 'designer-b@example.invalid', true,  false),
  ('Demo Senior Designer (placeholder)', 'senior@example.invalid', true, true)
on conflict (email) do nothing;

insert into settings (id) values (1) on conflict (id) do nothing;
