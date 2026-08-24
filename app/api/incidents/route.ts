import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/index";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { withRequestLog } from "@/lib/observability/request-log";

export const GET = withRequestLog("incidents.list", async (request: Request) => {
  const { provider } = getAuthProviderForRequest(request);
  const user = await provider.getUser();
  const repository = getRepository();
  const incidents = await repository.listIncidents(user?.id ?? null);
  return NextResponse.json({ incidents });
});
