import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getEmbeddingProvider, getLLMProvider } from "@/lib/gemini/index";
import { FAULT_SLUGS } from "@/simulator/fault-injection/index";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { incidentIdSchema } from "@/lib/security/validation";
import { runInvestigation } from "@/lib/investigation/pipeline";
import { buildHistoricalSummary } from "@/lib/investigation/historical-summary";
import { withRequestLog } from "@/lib/observability/request-log";

function isUpstreamQuotaError(message: string): boolean {
  return /\b429\b/.test(message);
}

export const POST = withRequestLog("incidents.investigate", async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const parsedId = incidentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await getRateLimiter().consume(`investigate:${clientKey}`);
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
    .map((other) => ({ incident: other, summary: buildHistoricalSummary(other) }));

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
      // This deployment's dataset is scoped entirely to this synthetic
      // fault taxonomy (see simulator/fault-injection), so constraining the
      // model's output to it is a real product decision here, not just an
      // eval-harness convenience -- it also keeps a real Gemini's output
      // directly comparable to the evaluation report's numbers.
      validRootCauses: [...FAULT_SLUGS],
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
    // Full detail (which can include internal error text we don't want a
    // client to see) is logged server-side only; the client always gets a
    // generic message, regardless of what threw.
    console.error(`Investigation failed for ${incident.id}:`, message);
    await repository.saveAnalysisRun({
      id: globalThis.crypto.randomUUID(),
      incidentId: incident.id,
      model: llmProvider.name,
      promptVersion: "v1",
      latencyMs: 0,
      status: "failed",
      createdAt: new Date().toISOString(),
    });
    if (isUpstreamQuotaError(message)) {
      return NextResponse.json(
        { error: "The AI provider is temporarily rate-limited or out of quota. Please try again in a minute." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "Investigation failed due to an upstream provider error." }, { status: 502 });
  }
});
