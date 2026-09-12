// Kept as a structural type with an index signature (rather than
// `NodeJS.ProcessEnv` or `Pick<NodeJS.ProcessEnv, ...>` directly) so both a
// plain test fixture object and the real `process.env` (which Next.js
// augments with a *required* `NODE_ENV`, and whose other keys only exist via
// an index signature) are assignable without TS2559/TS2345 under this
// project's strict + noUncheckedIndexedAccess tsconfig. `process.env` still
// satisfies this type structurally, so callers (including Task 3's
// instrumentation.ts) can pass it unchanged.
interface AuthDbEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  [key: string]: string | undefined;
}

/**
 * A real, persistent Supabase database configured without real Supabase
 * auth leaves the in-memory mock auth provider's plaintext-user-id session
 * cookie (see lib/auth/mock-auth-provider.ts) as the only thing standing
 * between an attacker and real multi-user data. This must never be allowed
 * to run -- fail fast rather than warn, per the project's Phase 0 security
 * baseline.
 */
export function validateAuthDbConfig(env: AuthDbEnv): void {
  const hasRealDatabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const hasRealAuth = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (hasRealDatabase && !hasRealAuth) {
    throw new Error(
      "Unsafe configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (a real, persistent database), " +
        "but NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not both set. This would run the " +
        "insecure in-memory mock auth provider against real, persistent data. Set both NEXT_PUBLIC_SUPABASE_URL " +
        "and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable real auth, or unset SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY " +
        "to use the in-memory database for local development.",
    );
  }
}
