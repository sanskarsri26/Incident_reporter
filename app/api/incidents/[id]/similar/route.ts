import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getEmbeddingProvider } from "@/lib/gemini/index";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { incidentIdSchema } from "@/lib/security/validation";
import { buildHistoricalSummary } from "@/lib/investigation/historical-summary";
import { findSimilarIncidents } from "@/lib/retrieval/similar-incidents";

const TOP_K = 5;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = incidentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await getRateLimiter().consume(`similar:${clientKey}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const repository = getRepository();
  const incident = await repository.getIncident(parsedId.data);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const allIncidents = await repository.listIncidents();
  const candidates = allIncidents.map((other) => ({ incident: other, summary: buildHistoricalSummary(other) }));

  const similar = await findSimilarIncidents(
    buildHistoricalSummary(incident),
    incident.id,
    candidates,
    getEmbeddingProvider(),
    TOP_K,
  );

  return NextResponse.json({
    similar: similar.map((entry) => ({ incident: entry.incident, similarity: entry.similarity })),
  });
}
