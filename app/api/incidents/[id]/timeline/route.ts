import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { incidentIdSchema } from "@/lib/security/validation";
import { buildTimeline } from "@/lib/investigation/timeline";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = incidentIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const repository = getRepository();
  const incident = await repository.getIncident(parsedId.data, user?.id ?? null);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const [logEvents, metricEvents] = await Promise.all([
    repository.listLogEvents(incident.id),
    repository.listMetricEvents(incident.id),
  ]);

  return NextResponse.json({ timeline: buildTimeline(logEvents, metricEvents) });
}
