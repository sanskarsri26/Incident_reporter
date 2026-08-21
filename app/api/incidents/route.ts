import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { withRequestLog } from "@/lib/observability/request-log";

export const GET = withRequestLog("incidents.list", async () => {
  const repository = getRepository();
  const incidents = await repository.listIncidents();
  return NextResponse.json({ incidents });
});
