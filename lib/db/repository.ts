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
} from "@/lib/types";

export interface RepositorySeed {
  incidents?: Incident[];
  services?: Service[];
  serviceDependencies?: ServiceDependency[];
  logEvents?: LogEvent[];
  metricEvents?: MetricEvent[];
  documents?: DocumentRecord[];
}

export interface Repository {
  listIncidents(): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | null>;
  upsertIncident(incident: Incident): Promise<void>;

  listServices(): Promise<Service[]>;
  listServiceDependencies(): Promise<ServiceDependency[]>;
  upsertService(service: Service): Promise<void>;
  upsertServiceDependency(dependency: ServiceDependency): Promise<void>;

  listLogEvents(incidentId: string): Promise<LogEvent[]>;
  listMetricEvents(incidentId: string): Promise<MetricEvent[]>;
  insertLogEvents(events: LogEvent[]): Promise<void>;
  insertMetricEvents(events: MetricEvent[]): Promise<void>;

  listDocuments(): Promise<DocumentRecord[]>;
  upsertDocument(document: DocumentRecord): Promise<void>;

  saveAnalysisRun(run: AnalysisRun): Promise<void>;
  savePredictions(predictions: Prediction[]): Promise<void>;
  saveEvidence(evidence: Evidence[]): Promise<void>;
  saveRecommendations(recommendations: Recommendation[]): Promise<void>;

  getLatestAnalysisRun(incidentId: string): Promise<AnalysisRun | null>;
  getPredictionsForRun(analysisRunId: string): Promise<Prediction[]>;
  getEvidenceForPrediction(predictionId: string): Promise<Evidence[]>;
  getRecommendationsForRun(analysisRunId: string): Promise<Recommendation[]>;
}
