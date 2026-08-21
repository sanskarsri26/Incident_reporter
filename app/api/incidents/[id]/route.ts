import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { incidentIdSchema } from "@/lib/security/validation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = incidentIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const repository = getRepository();
  const incident = await repository.getIncident(parsed.data);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }
  return NextResponse.json({ incident });
}
