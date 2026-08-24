import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { getEmbeddingProvider, getLLMProvider } from "@/lib/gemini/index";
import { FAULT_SLUGS } from "@/simulator/fault-injection/index";
import { consumeRateLimit, getRateLimiter } from "@/lib/security/rate-limit";
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
  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `investigate:${clientKey}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const ownerId = user?.id ?? null;

  const repository = getRepository();
  const incident = await repository.getIncident(parsedId.data, ownerId);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const [logEvents, metricEvents, documents, allIncidents] = await Promise.all([
    repository.listLogEvents(incident.id),
    repository.listMetricEvents(incident.id),
    repository.listDocuments(),
    repository.listIncidents(ownerId),
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
      // Only seeded (shared, owner_id: null) incidents are scoped to this
      // synthetic fault taxonomy -- a real uploaded incident's root cause
      // has nothing to do with it, so constraining the model's output
      // here would force a meaningless answer. See
      // docs/superpowers/specs/2026-08-23-multi-user-auth-design.md.
      validRootCauses: incident.ownerId === null ? [...FAULT_SLUGS] : undefined,
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
