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
  return createMockAuthProvider(cookies);
}
