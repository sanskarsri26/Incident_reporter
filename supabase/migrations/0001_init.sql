create extension if not exists vector;

create table if not exists services (
  id text primary key,
  name text not null,
  type text not null
);

create table if not exists service_dependencies (
  source_service text not null references services(id),
  target_service text not null references services(id),
  primary key (source_service, target_service)
);

create table if not exists incidents (
  id text primary key,
  title text not null,
  severity text not null check (severity in ('sev1','sev2','sev3','sev4')),
  status text not null check (status in ('open','investigating','resolved')),
  started_at timestamptz not null,
  resolved_at timestamptz,
  root_cause_truth text not null,
  affected_services text[] not null default '{}'
);

create table if not exists log_events (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  timestamp timestamptz not null,
  service text not null,
  level text not null check (level in ('debug','info','warn','error','fatal')),
  template text not null,
  count integer not null default 1
);
create index if not exists log_events_incident_idx on log_events(incident_id);

create table if not exists metric_events (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  timestamp timestamptz not null,
  service text not null,
  metric text not null,
  value double precision not null
);
create index if not exists metric_events_incident_idx on metric_events(incident_id);

create table if not exists documents (
  id text primary key,
  title text not null,
  body text not null,
  doc_type text not null check (doc_type in ('runbook','service_description','postmortem')),
  embedding vector(768)
);
-- hnsw, not ivfflat: ivfflat's index quality depends on training its
-- centroids against representative data present at CREATE INDEX time, but
-- this table is empty at migration time (seeding happens afterward), so
-- recall would stay degraded until a manual REINDEX post-seed. hnsw builds
-- incrementally as rows are inserted and needs no training-data step.
create index if not exists documents_embedding_idx on documents using hnsw (embedding vector_cosine_ops);

create table if not exists analysis_runs (
  id text primary key,
  incident_id text not null references incidents(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  latency_ms integer not null,
  status text not null check (status in ('succeeded','failed')),
  created_at timestamptz not null default now()
);
create index if not exists analysis_runs_incident_idx on analysis_runs(incident_id);

create table if not exists predictions (
  id text primary key,
  analysis_run_id text not null references analysis_runs(id) on delete cascade,
  root_cause text not null,
  rank integer not null,
  confidence double precision not null
);
create index if not exists predictions_run_idx on predictions(analysis_run_id);

create table if not exists evidence (
  id text primary key,
  prediction_id text not null references predictions(id) on delete cascade,
  source_type text not null check (source_type in ('log_event','metric_event','document','incident')),
  source_id text not null,
  support_type text not null check (support_type in ('supporting','contradicting'))
);
create index if not exists evidence_prediction_idx on evidence(prediction_id);

create table if not exists recommendations (
  id text primary key,
  analysis_run_id text not null references analysis_runs(id) on delete cascade,
  action text not null,
  priority integer not null
);
create index if not exists recommendations_run_idx on recommendations(analysis_run_id);

-- Row-level security, intentionally locked down with no policies: Supabase
-- exposes every table in the `public` schema through PostgREST to the
-- anon/authenticated roles by default. This app only ever talks to
-- Supabase via SUPABASE_SERVICE_ROLE_KEY from trusted server-side code
-- (lib/db/supabase-repository.ts), which bypasses RLS by design -- so
-- enabling RLS with zero policies means the anon key (unused by this app,
-- but present in any real Supabase project and easy to accidentally
-- expose) has no access to any row, while the service role key is
-- unaffected.
alter table services enable row level security;
alter table service_dependencies enable row level security;
alter table incidents enable row level security;
alter table log_events enable row level security;
alter table metric_events enable row level security;
alter table documents enable row level security;
alter table analysis_runs enable row level security;
alter table predictions enable row level security;
alter table evidence enable row level security;
alter table recommendations enable row level security;
-- feedback is created in 0002_feedback.sql, which enables RLS on itself.
