import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getEmbeddingProvider, getLLMProvider } from "@/lib/gemini/index";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { incidentIdSchema } from "@/lib/security/validation";
import { runInvestigation } from "@/lib/investigation/pipeline";
import type { Incident } from "@/lib/types";

function historicalSummary(incident: Incident): string {
  return `${incident.title}. Affected services: ${incident.affectedServices.join(", ") || "unknown"}.`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = incidentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await getRateLimiter().consume(clientKey);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const repository = getRepository();
  const incident = await repository.getIncident(parsedId.data);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const [logEvents, metricEvents, documents, allIncidents] = await Promise.all([
    repository.listLogEvents(incident.id),
    repository.listMetricEvents(incident.id),
    repository.listDocuments(),
    repository.listIncidents(),
  ]);

  const historicalIncidents = allIncidents
    .filter((other) => other.id !== incident.id)
    .map((other) => ({ incident: other, summary: historicalSummary(other) }));

  const llmProvider = getLLMProvider();

  try {
    const result = await runInvestigation({
      incident,
      logEvents,
      metricEvents,
      documents,
      historicalIncidents,
      llmProvider,
      embeddingProvider: getEmbeddingProvider(),
    });

    await repository.saveAnalysisRun(result.analysisRun);
    await repository.savePredictions(result.predictions);
    await Promise.all([repository.saveEvidence(result.evidence), repository.saveRecommendations(result.recommendations)]);

    return NextResponse.json({
      analysisRun: result.analysisRun,
      predictions: result.predictions,
      evidence: result.evidence,
      recommendations: result.recommendations,
      evidenceCatalog: result.evidenceCatalog,
      finalRootCause: result.predictions[0]?.rootCause ?? "unknown",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Investigation failed";
    await repository.saveAnalysisRun({
      id: globalThis.crypto.randomUUID(),
      incidentId: incident.id,
      model: llmProvider.name,
      promptVersion: "v1",
      latencyMs: 0,
      status: "failed",
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
