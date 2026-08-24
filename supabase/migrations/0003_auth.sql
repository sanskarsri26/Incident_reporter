alter table incidents add column owner_id uuid references auth.users(id);
alter table incidents alter column root_cause_truth drop not null;
create index if not exists incidents_owner_idx on incidents(owner_id);
