import { createServerClient } from "@supabase/ssr";
import type { AuthProvider, AuthResult } from "@/lib/auth/types";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";

export function createSupabaseAuthProvider(cookies: CookieAdapter, url: string, anonKey: string): AuthProvider {
  const client = createServerClient(url, anonKey, { cookies });

  function toResult(data: { user: { id: string; email?: string } | null }, error: { message: string } | null): AuthResult {
    if (error || !data.user) return { user: null, error: error?.message ?? "Authentication failed" };
    return { user: { id: data.user.id, email: data.user.email ?? null }, error: null };
  }

  return {
    name: "supabase",
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      // Supabase's default "Confirm email" project setting returns a user but no
      // session (and no cookie gets written) until the confirmation link is
      // clicked -- treating that as an ordinary success would silently redirect
      // to a page with no session. It also returns this same shape (no error)
      // for a duplicate-email signup, for anti-enumeration reasons.
      if (!error && data.user && !data.session) {
        return { user: null, error: "Check your email to confirm your account before logging in." };
      }
      return toResult(data, error);
    },
    async signInWithPassword(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      return toResult(data, error);
    },
    async signOut() {
      await client.auth.signOut();
    },
    async getUser() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
  };
}
