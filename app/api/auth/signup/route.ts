import { NextResponse } from "next/server";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";
import { consumeRateLimit, getRateLimiter } from "@/lib/security/rate-limit";
import { authCredentialsSchema } from "@/lib/security/validation";
import { withRequestLog } from "@/lib/observability/request-log";

function applyCookies(response: NextResponse, cookies: string[]): NextResponse {
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

export const POST = withRequestLog("auth.signup", async (request: Request) => {
  const clientKey = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitResult = await consumeRateLimit(getRateLimiter(), `auth:${clientKey}`);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = authCredentialsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
  }

  const { provider, takeSetCookieHeaders } = getAuthProviderForRequest(request);
  const result = await provider.signUp(parsed.data.email, parsed.data.password);

  const response = result.error
    ? NextResponse.json({ error: result.error }, { status: 400 })
    : NextResponse.json({ ok: true });
  return applyCookies(response, takeSetCookieHeaders());
});
