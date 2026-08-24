import type { AuthProvider } from "@/lib/auth/types";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";
import { createMockAuthProvider } from "@/lib/auth/mock-auth-provider";
import { createSupabaseAuthProvider } from "@/lib/auth/supabase-auth-provider";

export function getAuthProvider(cookies: CookieAdapter): AuthProvider {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    return createSupabaseAuthProvider(cookies, url, anonKey);
  }

  // Two independent env-var pairs (this one and lib/db/index.ts's
  // SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) with no cross-check: a real,
  // persistent database configured without real auth means the mock
  // provider's plaintext-user-id session cookie is the only thing standing
  // between an attacker and real multi-user data. Warn loudly rather than
  // throw -- a deployment mid-setup shouldn't be hard-broken by this.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "SUPABASE_URL is configured for a real database, but NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — auth is running on the insecure in-memory mock provider against real, persistent data. Set the NEXT_PUBLIC_SUPABASE_* vars to use real auth.",
    );
  }

  return createMockAuthProvider(cookies);
}
