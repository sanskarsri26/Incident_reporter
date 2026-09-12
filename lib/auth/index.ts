import type { AuthProvider } from "@/lib/auth/types";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";
import { createMockAuthProvider } from "@/lib/auth/mock-auth-provider";
import { createSupabaseAuthProvider } from "@/lib/auth/supabase-auth-provider";
import { validateAuthDbConfig } from "@/lib/config/validate-env";

export function getAuthProvider(cookies: CookieAdapter): AuthProvider {
  // Also validated at process startup in instrumentation.ts -- this
  // second call is deliberate defense in depth: it covers any code path
  // (tests, scripts) that imports this module directly without going
  // through a full Next.js server boot.
  validateAuthDbConfig(process.env);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    return createSupabaseAuthProvider(cookies, url, anonKey);
  }

  return createMockAuthProvider(cookies);
}
