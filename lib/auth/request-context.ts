import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SerializeOptions } from "cookie";
import { getAuthProvider } from "@/lib/auth/index";
import type { AuthProvider } from "@/lib/auth/types";

// @supabase/ssr only needs {getAll, setAll} over cookies -- it has no
// hard dependency on next/headers. Building the adapter from the
// Request's own Cookie header (rather than next/headers's cookies())
// means these routes stay testable by constructing a plain Request and
// calling the exported handler directly, matching every existing
// tests/api/*.test.ts file. next/headers's cookies() only works inside
// Next's own request-scoped route invocation, which a direct function
// call in a test bypasses.
export function getAuthProviderForRequest(request: Request): {
  provider: AuthProvider;
  takeSetCookieHeaders(): string[];
} {
  const setCookieHeaders: string[] = [];
  const provider = getAuthProvider({
    getAll() {
      return parseCookieHeader(request.headers.get("cookie") ?? "");
    },
    setAll(cookies) {
      for (const { name, value, options } of cookies) {
        // serializeCookieHeader's `options` param is required, unlike
        // CookieAdapter's -- signOut() (and the mock provider's own
        // setSession(null)) call setAll without one.
        setCookieHeaders.push(serializeCookieHeader(name, value, (options ?? {}) as SerializeOptions));
      }
    },
  });
  return { provider, takeSetCookieHeaders: () => setCookieHeaders };
}
