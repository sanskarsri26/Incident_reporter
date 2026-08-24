import { randomUUID, createHash } from "node:crypto";
import type { AuthProvider, AuthResult, AuthUser } from "@/lib/auth/types";
import type { CookieAdapter } from "@/lib/auth/cookie-adapter";

interface MockUser {
  id: string;
  email: string;
  // Demo/local-dev only -- this provider only ever activates when no real
  // Supabase project is configured (see lib/auth/index.ts), mirroring the
  // mock LLM/embedding providers' "deterministic, not a security control"
  // scope. A real deployment always uses createSupabaseAuthProvider.
  passwordHash: string;
}

const SESSION_COOKIE = "mock-session";

// globalThis-backed, not module-scoped -- Next.js gives Server Components
// and Route Handlers separate module instances (each with its own copy of
// this file's top-level scope), so a plain `let usersByEmail = new Map()`
// would make a user created via a POST /api/auth/signup route handler
// invisible to a Server Component reading it back moments later (e.g.
// NavBar). Same fix, same reasoning, as lib/db/index.ts's
// globalForRepository. Process-lifetime only: fine for local dev/CI,
// resets on server restart.
const globalForMockAuth = globalThis as typeof globalThis & { __incidentInvestigatorMockUsers?: Map<string, MockUser> };

function getUsersByEmail(): Map<string, MockUser> {
  if (!globalForMockAuth.__incidentInvestigatorMockUsers) {
    globalForMockAuth.__incidentInvestigatorMockUsers = new Map();
  }
  return globalForMockAuth.__incidentInvestigatorMockUsers;
}

export function resetMockAuthProviderForTests(): void {
  globalForMockAuth.__incidentInvestigatorMockUsers = new Map();
}

function hash(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function createMockAuthProvider(cookies: CookieAdapter): AuthProvider {
  function setSession(userId: string | null): void {
    cookies.setAll([
      {
        name: SESSION_COOKIE,
        value: userId ?? "",
        options: { httpOnly: true, path: "/", maxAge: userId ? 60 * 60 * 24 * 30 : 0 },
      },
    ]);
  }

  function toAuthUser(user: MockUser): AuthUser {
    return { id: user.id, email: user.email };
  }

  return {
    name: "mock",

    async signUp(email, password): Promise<AuthResult> {
      const normalized = email.trim().toLowerCase();
      const usersByEmail = getUsersByEmail();
      if (usersByEmail.has(normalized)) {
        return { user: null, error: "An account with this email already exists." };
      }
      const user: MockUser = { id: randomUUID(), email: normalized, passwordHash: hash(password) };
      usersByEmail.set(normalized, user);
      setSession(user.id);
      return { user: toAuthUser(user), error: null };
    },

    async signInWithPassword(email, password): Promise<AuthResult> {
      const normalized = email.trim().toLowerCase();
      const user = getUsersByEmail().get(normalized);
      if (!user || user.passwordHash !== hash(password)) {
        return { user: null, error: "Invalid login credentials" };
      }
      setSession(user.id);
      return { user: toAuthUser(user), error: null };
    },

    async signOut(): Promise<void> {
      setSession(null);
    },

    async getUser(): Promise<AuthUser | null> {
      const sessionCookie = cookies.getAll().find((c) => c.name === SESSION_COOKIE);
      if (!sessionCookie || !sessionCookie.value) return null;
      const user = [...getUsersByEmail().values()].find((u) => u.id === sessionCookie.value);
      return user ? toAuthUser(user) : null;
    },
  };
}
