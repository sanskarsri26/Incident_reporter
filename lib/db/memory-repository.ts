import type { Repository, RepositorySeed } from "@/lib/db/repository";
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

export function createMemoryRepository(seed: RepositorySeed = {}): Repository {
  const incidents = new Map<string, Incident>((seed.incidents ?? []).map((i) => [i.id, i]));
  const services = new Map<string, Service>((seed.services ?? []).map((s) => [s.id, s]));
  const serviceDependencies: ServiceDependency[] = [...(seed.serviceDependencies ?? [])];
  const logEvents = new Map<string, LogEvent[]>();
  const metricEvents = new Map<string, MetricEvent[]>();
  const documents = new Map<string, DocumentRecord>((seed.documents ?? []).map((d) => [d.id, d]));
  const analysisRuns = new Map<string, AnalysisRun[]>();
  const predictionsByRun = new Map<string, Prediction[]>();
  const evidenceByPrediction = new Map<string, Evidence[]>();
  const recommendationsByRun = new Map<string, Recommendation[]>();
  const feedbackEntries: Feedback[] = [];

  for (const event of seed.logEvents ?? []) {
    const list = logEvents.get(event.incidentId) ?? [];
    list.push(event);
    logEvents.set(event.incidentId, list);
  }
  for (const event of seed.metricEvents ?? []) {
    const list = metricEvents.get(event.incidentId) ?? [];
    list.push(event);
    metricEvents.set(event.incidentId, list);
  }

  return {
    async listIncidents() {
      return [...incidents.values()];
    },
    async getIncident(id) {
      return incidents.get(id) ?? null;
    },
    async upsertIncident(incident) {
      incidents.set(incident.id, incident);
    },

    async listServices() {
      return [...services.values()];
    },
    async listServiceDependencies() {
      return serviceDependencies;
    },
    async upsertService(service) {
      services.set(service.id, service);
    },
    async upsertServiceDependency(dependency) {
      const exists = serviceDependencies.some(
        (d) => d.sourceService === dependency.sourceService && d.targetService === dependency.targetService,
      );
      if (!exists) serviceDependencies.push(dependency);
    },

    async listLogEvents(incidentId) {
      return logEvents.get(incidentId) ?? [];
    },
    async listMetricEvents(incidentId) {
      return metricEvents.get(incidentId) ?? [];
    },
    async insertLogEvents(events) {
      for (const event of events) {
        const list = logEvents.get(event.incidentId) ?? [];
        list.push(event);
        logEvents.set(event.incidentId, list);
      }
    },
    async insertMetricEvents(events) {
      for (const event of events) {
        const list = metricEvents.get(event.incidentId) ?? [];
        list.push(event);
        metricEvents.set(event.incidentId, list);
      }
    },

    async listDocuments() {
      return [...documents.values()];
    },
    async upsertDocument(document) {
      documents.set(document.id, document);
    },

    async saveAnalysisRun(run) {
      const list = analysisRuns.get(run.incidentId) ?? [];
      list.push(run);
      analysisRuns.set(run.incidentId, list);
    },
    async savePredictions(predictions) {
      for (const prediction of predictions) {
        const list = predictionsByRun.get(prediction.analysisRunId) ?? [];
        list.push(prediction);
        predictionsByRun.set(prediction.analysisRunId, list);
      }
    },
    async saveEvidence(evidenceList) {
      for (const evidence of evidenceList) {
        const list = evidenceByPrediction.get(evidence.predictionId) ?? [];
        list.push(evidence);
        evidenceByPrediction.set(evidence.predictionId, list);
      }
    },
    async saveRecommendations(recommendations) {
      for (const recommendation of recommendations) {
        const list = recommendationsByRun.get(recommendation.analysisRunId) ?? [];
        list.push(recommendation);
        recommendationsByRun.set(recommendation.analysisRunId, list);
      }
    },

    async getLatestAnalysisRun(incidentId) {
      const list = analysisRuns.get(incidentId) ?? [];
      if (list.length === 0) return null;
      return list.reduce((latest, run) => (run.createdAt > latest.createdAt ? run : latest));
    },
    async getPredictionsForRun(analysisRunId) {
      return predictionsByRun.get(analysisRunId) ?? [];
    },
    async getEvidenceForPrediction(predictionId) {
      return evidenceByPrediction.get(predictionId) ?? [];
    },
    async getRecommendationsForRun(analysisRunId) {
      return recommendationsByRun.get(analysisRunId) ?? [];
    },

    async saveFeedback(feedback) {
      feedbackEntries.push(feedback);
    },
    async listFeedback() {
      return feedbackEntries;
    },
  };
}
