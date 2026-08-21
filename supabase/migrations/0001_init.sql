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
create index if not exists documents_embedding_idx on documents using ivfflat (embedding vector_cosine_ops);

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
