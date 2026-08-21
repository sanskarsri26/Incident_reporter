import { describe, it, expect } from "vitest";
import { runInvestigation } from "@/lib/investigation/pipeline";
import { createMockEmbeddingProvider, createMockLLMProvider } from "@/lib/gemini/mock-provider";
import { createHallucinatingLLMProvider } from "./fixtures/hallucinating-llm-provider";
import type { DocumentRecord, Incident, LogEvent, MetricEvent } from "@/lib/types";

const incident: Incident = {
  id: "INC-0042",
  title: "Checkout errors spiking",
  severity: "sev1",
  status: "resolved",
  startedAt: "2026-01-01T10:00:00.000Z",
  resolvedAt: "2026-01-01T10:30:00.000Z",
  rootCauseTruth: "db_connection_pool_exhaustion",
  affectedServices: ["checkout-service", "payment-service"],
};

const logEvents: LogEvent[] = [
  { id: "L1", incidentId: incident.id, timestamp: "2026-01-01T10:05:00.000Z", service: "postgres", level: "error", template: "connection pool limit reached, connection timeout", count: 5 },
  { id: "L2", incidentId: incident.id, timestamp: "2026-01-01T10:06:00.000Z", service: "payment-service", level: "warn", template: "retrying after db error", count: 3 },
];

const metricEvents: MetricEvent[] = [
  { id: "M1", incidentId: incident.id, timestamp: "2026-01-01T10:05:30.000Z", service: "postgres", metric: "active_connections", value: 20 },
];

async function embeddedDocs(): Promise<DocumentRecord[]> {
  const provider = createMockEmbeddingProvider();
  const raw = [
    { id: "DOC-1", title: "Connection pool runbook", body: "diagnose postgres connection pool exhaustion and connection timeout issues", docType: "runbook" as const },
  ];
  const vectors = await provider.embed(raw.map((d) => `${d.title} ${d.body}`));
  return raw.map((d, i) => ({ ...d, embedding: vectors[i] ?? null }));
}

describe("runInvestigation", () => {
  it("produces a final root cause matching the injected fault, with only catalog-backed evidence", async () => {
    const documents = await embeddedDocs();
    const result = await runInvestigation({
      incident,
      logEvents,
      metricEvents,
      documents,
      historicalIncidents: [],
      llmProvider: createMockLLMProvider(),
      embeddingProvider: createMockEmbeddingProvider(),
    });

    expect(result.predictions[0]?.rootCause).toBe("db_connection_pool_exhaustion");
    expect(result.predictions[0]?.rank).toBe(1);

    const catalogIds = new Set(result.evidenceCatalog.map((c) => c.id));
    for (const item of result.evidence) {
      expect(["log_event", "metric_event", "document", "incident"]).toContain(item.sourceType);
    }
    expect(result.candidateDiagnostics.every((d) => d.unsupportedCitationCount === 0)).toBe(true);
    expect(catalogIds.size).toBeGreaterThan(0);
  });

  it("predictions are sorted by descending ranking score (confidence field)", async () => {
    const documents = await embeddedDocs();
    const result = await runInvestigation({
      incident,
      logEvents,
      metricEvents,
      documents,
      historicalIncidents: [],
      llmProvider: createMockLLMProvider(),
      embeddingProvider: createMockEmbeddingProvider(),
    });

    for (let i = 1; i < result.predictions.length; i += 1) {
      const prev = result.predictions[i - 1];
      const curr = result.predictions[i];
      if (prev && curr) expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
    }
  });

  it("generates recommendations tied to the analysis run", async () => {
    const documents = await embeddedDocs();
    const result = await runInvestigation({
      incident,
      logEvents,
      metricEvents,
      documents,
      historicalIncidents: [],
      llmProvider: createMockLLMProvider(),
      embeddingProvider: createMockEmbeddingProvider(),
    });

    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect(rec.analysisRunId).toBe(result.analysisRun.id);
    }
  });

  it("counts at least 4 provider requests (2 embeddings, generate candidates, generate actions) plus one verify per candidate", async () => {
    const documents = await embeddedDocs();
    const result = await runInvestigation({
      incident,
      logEvents,
      metricEvents,
      documents,
      historicalIncidents: [],
      llmProvider: createMockLLMProvider(),
      embeddingProvider: createMockEmbeddingProvider(),
    });

    expect(result.requestCount).toBe(4 + result.candidateDiagnostics.length);
  });

  it("records a succeeded analysis run with a non-negative latency", async () => {
    const documents = await embeddedDocs();
    const result = await runInvestigation({
      incident,
      logEvents,
      metricEvents,
      documents,
      historicalIncidents: [],
      llmProvider: createMockLLMProvider(),
      embeddingProvider: createMockEmbeddingProvider(),
    });

    expect(result.analysisRun.status).toBe("succeeded");
    expect(result.analysisRun.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.analysisRun.model).toBe("mock");
  });

  it("does not crash for a freshly opened incident with no logs, metrics, docs, or history yet", async () => {
    const emptyIncident = { ...incident, status: "open" as const, resolvedAt: null };
    const result = await runInvestigation({
      incident: emptyIncident,
      logEvents: [],
      metricEvents: [],
      documents: [],
      historicalIncidents: [],
      llmProvider: createMockLLMProvider(),
      embeddingProvider: createMockEmbeddingProvider(),
    });

    expect(result.analysisRun.status).toBe("succeeded");
    expect(result.predictions[0]?.rootCause).toBe("unknown");
    expect(result.evidence).toEqual([]);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  describe("against a hallucinating LLM provider (proves the evidence-validation safety property)", () => {
    it("drops fabricated evidence IDs from every candidate's citations", async () => {
      const documents = await embeddedDocs();
      const result = await runInvestigation({
        incident,
        logEvents,
        metricEvents,
        documents,
        historicalIncidents: [],
        llmProvider: createHallucinatingLLMProvider({ fabricatedIds: ["DOC-9999", "LOG-999"] }),
        embeddingProvider: createMockEmbeddingProvider(),
      });

      for (const diagnostic of result.candidateDiagnostics) {
        expect(diagnostic.supportingEvidenceIds).not.toContain("DOC-9999");
        expect(diagnostic.supportingEvidenceIds).not.toContain("LOG-999");
        expect(diagnostic.contradictingEvidenceIds).not.toContain("DOC-9999");
        expect(diagnostic.contradictingEvidenceIds).not.toContain("LOG-999");
      }
    });

    it("counts fabricated citations as unsupported, matching the number injected", async () => {
      const documents = await embeddedDocs();
      const fabricatedIds = ["DOC-9999", "LOG-999"];
      const result = await runInvestigation({
        incident,
        logEvents,
        metricEvents,
        documents,
        historicalIncidents: [],
        llmProvider: createHallucinatingLLMProvider({ fabricatedIds }),
        embeddingProvider: createMockEmbeddingProvider(),
      });

      expect(result.candidateDiagnostics[0]?.unsupportedCitationCount).toBe(fabricatedIds.length);
    });

    it("never persists a fabricated evidence ID in the returned Evidence records", async () => {
      const documents = await embeddedDocs();
      const fabricatedIds = ["DOC-9999", "LOG-999"];
      const result = await runInvestigation({
        incident,
        logEvents,
        metricEvents,
        documents,
        historicalIncidents: [],
        llmProvider: createHallucinatingLLMProvider({ fabricatedIds }),
        embeddingProvider: createMockEmbeddingProvider(),
      });

      const persistedSourceIds = result.evidence.map((e) => e.sourceId);
      for (const fabricated of fabricatedIds) {
        expect(persistedSourceIds).not.toContain(fabricated);
      }
    });

    it("does not throw or produce NaN scores when a candidate's citations are entirely fabricated", async () => {
      const documents = await embeddedDocs();
      const result = await runInvestigation({
        incident,
        logEvents,
        metricEvents,
        documents,
        historicalIncidents: [],
        llmProvider: createHallucinatingLLMProvider({ allCitationsFabricated: true }),
        embeddingProvider: createMockEmbeddingProvider(),
      });

      expect(result.candidateDiagnostics[0]?.supportingEvidenceIds).toEqual([]);
      expect(Number.isNaN(result.candidateDiagnostics[0]?.rankingScore)).toBe(false);
      expect(result.predictions[0]?.confidence).toBeGreaterThanOrEqual(0);
    });

    it("filters the verifier's confirmedEvidenceIds down to IDs actually cited by the candidate", async () => {
      const documents = await embeddedDocs();
      const result = await runInvestigation({
        incident,
        logEvents,
        metricEvents,
        documents,
        historicalIncidents: [],
        // The verifier fixture always claims to additionally confirm
        // METRIC-8888, which is never a real cited id -- a real verifier
        // has no legitimate basis to introduce a new citation of its own.
        llmProvider: createHallucinatingLLMProvider({ fabricatedIds: [], fabricatedConfirmedIds: ["METRIC-8888"] }),
        embeddingProvider: createMockEmbeddingProvider(),
      });

      expect(result.candidateDiagnostics[0]?.confirmedEvidenceIds).not.toContain("METRIC-8888");
    });
  });
});
