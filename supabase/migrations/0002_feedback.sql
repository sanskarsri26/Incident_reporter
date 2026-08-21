create table if not exists feedback (
  id text primary key,
  incident_id text references incidents(id) on delete set null,
  message text not null,
  rating integer,
  created_at timestamptz not null default now()
);
create index if not exists feedback_incident_idx on feedback(incident_id);
