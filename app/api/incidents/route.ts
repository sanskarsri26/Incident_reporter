import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";

export async function GET() {
  const repository = getRepository();
  const incidents = await repository.listIncidents();
  return NextResponse.json({ incidents });
}
