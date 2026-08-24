import { NextResponse, type NextRequest } from "next/server";
import { getAuthProviderForRequest } from "@/lib/auth/request-context";

// Next.js 16 renamed the middleware.ts convention to proxy.ts (the
// `middleware` export is deprecated -- see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Behavior is identical; only the file/export name changed.
export async function proxy(request: NextRequest) {
  const { provider, takeSetCookieHeaders } = getAuthProviderForRequest(request);
  // Calling getUser() here (rather than just reading the cookie) is what
  // triggers @supabase/ssr's token refresh when the access token is
  // nearing expiry -- Server Components can't write cookies themselves,
  // so without this, sessions would silently start failing ~1 hour after
  // login even though the refresh token is still valid.
  const user = await provider.getUser();

  let response = NextResponse.next();
  for (const cookie of takeSetCookieHeaders()) response.headers.append("set-cookie", cookie);

  if (request.nextUrl.pathname.startsWith("/incidents/upload") && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    response = NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
