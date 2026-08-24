-- on delete cascade (not set null): set null would republish a deleted user's
-- private incidents into the shared catalog, since owner_id IS NULL is what
-- makes an incident visible to everyone.
alter table incidents add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table incidents alter column root_cause_truth drop not null;
create index if not exists incidents_owner_idx on incidents(owner_id);
