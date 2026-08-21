import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { feedbackRequestSchema } from "@/lib/security/validation";

const MAX_BODY_BYTES = 4000;

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = feedbackRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback payload", issues: parsed.error.issues }, { status: 400 });
  }

  const repository = getRepository();
  const feedback = {
    id: globalThis.crypto.randomUUID(),
    incidentId: parsed.data.incidentId,
    message: parsed.data.message,
    rating: parsed.data.rating,
    createdAt: new Date().toISOString(),
  };
  await repository.saveFeedback(feedback);

  return NextResponse.json({ feedback }, { status: 201 });
}
