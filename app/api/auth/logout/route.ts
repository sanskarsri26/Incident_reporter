import { NextResponse } from "next/server";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { withRequestLog } from "@/lib/observability/request-log";

export const POST = withRequestLog("auth.logout", async (request: Request) => {
  const { provider, takeSetCookieHeaders } = getAuthProviderForRequest(request);
  await provider.signOut();
  const response = NextResponse.json({ ok: true });
  for (const cookie of takeSetCookieHeaders()) response.headers.append("set-cookie", cookie);
  return response;
});
