import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "@/lib/db/repository";
import type {
  Incident,
  Service,
  ServiceDependency,
  LogEvent,
  MetricEvent,
  DocumentRecord,
  AnalysisRun,
  Prediction,
  Evidence,
  Recommendation,
  Feedback,
} from "@/lib/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function incidentFromRow(row: Record<string, unknown>): Incident {
  return {
    id: row.id as string,
    title: row.title as string,
    severity: row.severity as Incident["severity"],
    status: row.status as Incident["status"],
    startedAt: row.started_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    rootCauseTruth: (row.root_cause_truth as string | null) ?? null,
    affectedServices: (row.affected_services as string[]) ?? [],
    ownerId: (row.owner_id as string | null) ?? null,
  };
}

function logEventFromRow(row: Record<string, unknown>): LogEvent {
  return {
    id: row.id as string,
    incidentId: row.incident_id as string,
    timestamp: row.timestamp as string,
    service: row.service as string,
    level: row.level as LogEvent["level"],
    template: row.template as string,
    count: row.count as number,
  };
}

function metricEventFromRow(row: Record<string, unknown>): MetricEvent {
  return {
    id: row.id as string,
    incidentId: row.incident_id as string,
    timestamp: row.timestamp as string,
    service: row.service as string,
    metric: row.metric as string,
    value: row.value as number,
  };
}

// PostgREST serializes a pgvector column as a JSON *string* like
// "[0.1,0.2,...]", not a native JSON array -- a plain `as number[]` cast
// here would be a lie at runtime, and cosineSimilarity (lib/retrieval/
// cosine.ts) would iterate the string's characters instead of numbers,
// silently returning NaN similarity for every document. Parse it for real,
// and validate the parsed shape since it's data from an external system.
function parseEmbedding(value: unknown): number[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
        return parsed as number[];
      }
    } catch {
      // fall through to null below
    }
  }
  return null;
}

function documentFromRow(row: Record<string, unknown>): DocumentRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    docType: row.doc_type as DocumentRecord["docType"],
    embedding: parseEmbedding(row.embedding),
  };
}

function analysisRunFromRow(row: Record<string, unknown>): AnalysisRun {
  return {
    id: row.id as string,
    incidentId: row.incident_id as string,
    model: row.model as string,
    promptVersion: row.prompt_version as string,
    latencyMs: row.latency_ms as number,
    status: row.status as AnalysisRun["status"],
    createdAt: row.created_at as string,
  };
}

function predictionFromRow(row: Record<string, unknown>): Prediction {
  return {
    id: row.id as string,
    analysisRunId: row.analysis_run_id as string,
    rootCause: row.root_cause as string,
    rank: row.rank as number,
    confidence: row.confidence as number,
  };
}

function evidenceFromRow(row: Record<string, unknown>): Evidence {
  return {
    id: row.id as string,
    predictionId: row.prediction_id as string,
    sourceType: row.source_type as Evidence["sourceType"],
    sourceId: row.source_id as string,
    supportType: row.support_type as Evidence["supportType"],
  };
}

function recommendationFromRow(row: Record<string, unknown>): Recommendation {
  return {
    id: row.id as string,
    analysisRunId: row.analysis_run_id as string,
    action: row.action as string,
    priority: row.priority as number,
  };
}

export function createSupabaseRepository(url: string, serviceRoleKey: string): Repository {
  return createSupabaseRepositoryFromClient(createClient(url, serviceRoleKey));
}

export function createSupabaseRepositoryFromClient(client: SupabaseClient): Repository {
  return {
    async listIncidents(ownerId) {
      const query = client.from("incidents").select("*");
      if (ownerId && !UUID_PATTERN.test(ownerId)) {
        // This string is interpolated straight into a PostgREST filter below and is the
        // entire row-visibility boundary for this app-code-enforced auth model (no RLS) --
        // fail closed rather than trust every future caller to only pass a well-formed UUID.
        return [];
      }
      const { data, error } = ownerId
        ? await query.or(`owner_id.is.null,owner_id.eq.${ownerId}`)
        : await query.is("owner_id", null);
      if (error) throw error;
      return (data ?? []).map(incidentFromRow);
    },
    async getIncident(id, ownerId) {
      const { data, error } = await client.from("incidents").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const incident = incidentFromRow(data);
      if (incident.ownerId !== null && incident.ownerId !== ownerId) return null;
      return incident;
    },
    async upsertIncident(incident: Incident) {
      const { error } = await client.from("incidents").upsert({
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        started_at: incident.startedAt,
        resolved_at: incident.resolvedAt,
        root_cause_truth: incident.rootCauseTruth,
        affected_services: incident.affectedServices,
        owner_id: incident.ownerId,
      });
      if (error) throw error;
    },

    async listServices() {
      const { data, error } = await client.from("services").select("*");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
    async listServiceDependencies() {
      const { data, error } = await client.from("service_dependencies").select("*");
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        sourceService: row.source_service as string,
        targetService: row.target_service as string,
      }));
    },
    async upsertService(service: Service) {
      const { error } = await client.from("services").upsert(service);
      if (error) throw error;
    },
    async upsertServiceDependency(dependency: ServiceDependency) {
      const { error } = await client.from("service_dependencies").upsert({
        source_service: dependency.sourceService,
        target_service: dependency.targetService,
      });
      if (error) throw error;
    },

    async listLogEvents(incidentId) {
      const { data, error } = await client.from("log_events").select("*").eq("incident_id", incidentId);
      if (error) throw error;
      return (data ?? []).map(logEventFromRow);
    },
    async listMetricEvents(incidentId) {
      const { data, error } = await client.from("metric_events").select("*").eq("incident_id", incidentId);
      if (error) throw error;
      return (data ?? []).map(metricEventFromRow);
    },
    async insertLogEvents(events: LogEvent[]) {
      if (events.length === 0) return;
      // upsert, not insert: `npm run seed` must be safe to re-run against a
      // real database (README's own documented deploy step) -- insert()
      // hit a duplicate-key violation on the second run and aborted
      // partway, leaving the dataset half-loaded.
      const { error } = await client.from("log_events").upsert(
        events.map((e) => ({
          id: e.id,
          incident_id: e.incidentId,
          timestamp: e.timestamp,
          service: e.service,
          level: e.level,
          template: e.template,
          count: e.count,
        })),
      );
      if (error) throw error;
    },
    async insertMetricEvents(events: MetricEvent[]) {
      if (events.length === 0) return;
      // upsert, not insert -- see insertLogEvents above for why.
      const { error } = await client.from("metric_events").upsert(
        events.map((e) => ({
          id: e.id,
          incident_id: e.incidentId,
          timestamp: e.timestamp,
          service: e.service,
          metric: e.metric,
          value: e.value,
        })),
      );
      if (error) throw error;
    },

    async listDocuments() {
      const { data, error } = await client.from("documents").select("*");
      if (error) throw error;
      return (data ?? []).map(documentFromRow);
    },
    async upsertDocument(document: DocumentRecord) {
      const { error } = await client.from("documents").upsert({
        id: document.id,
        title: document.title,
        body: document.body,
        doc_type: document.docType,
        embedding: document.embedding,
      });
      if (error) throw error;
    },

    async saveAnalysisRun(run: AnalysisRun) {
      const { error } = await client.from("analysis_runs").insert({
        id: run.id,
        incident_id: run.incidentId,
        model: run.model,
        prompt_version: run.promptVersion,
        latency_ms: run.latencyMs,
        status: run.status,
        created_at: run.createdAt,
      });
      if (error) throw error;
    },
    async savePredictions(predictions: Prediction[]) {
      if (predictions.length === 0) return;
      const { error } = await client.from("predictions").insert(
        predictions.map((p) => ({
          id: p.id,
          analysis_run_id: p.analysisRunId,
          root_cause: p.rootCause,
          rank: p.rank,
          confidence: p.confidence,
        })),
      );
      if (error) throw error;
    },
    async saveEvidence(evidenceList: Evidence[]) {
      if (evidenceList.length === 0) return;
      const { error } = await client.from("evidence").insert(
        evidenceList.map((e) => ({
          id: e.id,
          prediction_id: e.predictionId,
          source_type: e.sourceType,
          source_id: e.sourceId,
          support_type: e.supportType,
        })),
      );
      if (error) throw error;
    },
    async saveRecommendations(recommendations: Recommendation[]) {
      if (recommendations.length === 0) return;
      const { error } = await client.from("recommendations").insert(
        recommendations.map((r) => ({
          id: r.id,
          analysis_run_id: r.analysisRunId,
          action: r.action,
          priority: r.priority,
        })),
      );
      if (error) throw error;
    },

    async getLatestAnalysisRun(incidentId) {
      const { data, error } = await client
        .from("analysis_runs")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? analysisRunFromRow(data) : null;
    },
    async getPredictionsForRun(analysisRunId) {
      const { data, error } = await client.from("predictions").select("*").eq("analysis_run_id", analysisRunId);
      if (error) throw error;
      return (data ?? []).map(predictionFromRow);
    },
    async getEvidenceForPrediction(predictionId) {
      const { data, error } = await client.from("evidence").select("*").eq("prediction_id", predictionId);
      if (error) throw error;
      return (data ?? []).map(evidenceFromRow);
    },
    async getRecommendationsForRun(analysisRunId) {
      const { data, error } = await client.from("recommendations").select("*").eq("analysis_run_id", analysisRunId);
      if (error) throw error;
      return (data ?? []).map(recommendationFromRow);
    },

    async saveFeedback(feedback: Feedback) {
      const { error } = await client.from("feedback").insert({
        id: feedback.id,
        incident_id: feedback.incidentId,
        message: feedback.message,
        rating: feedback.rating,
        created_at: feedback.createdAt,
      });
      if (error) throw error;
    },
    async listFeedback() {
      const { data, error } = await client.from("feedback").select("*");
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        incidentId: (row.incident_id as string | null) ?? null,
        message: row.message as string,
        rating: (row.rating as number | null) ?? null,
        createdAt: row.created_at as string,
      }));
    },
  };
}
