create table if not exists feedback (
  id text primary key,
  incident_id text references incidents(id) on delete set null,
  message text not null,
  rating integer,
  created_at timestamptz not null default now()
);
create index if not exists feedback_incident_idx on feedback(incident_id);

-- See the comment in 0001_init.sql: this app only ever writes via the
-- service role key server-side, which bypasses RLS, so a lockdown with no
-- policies is intentional.
alter table feedback enable row level security;
