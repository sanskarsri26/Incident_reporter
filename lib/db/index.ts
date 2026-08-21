import type { Repository } from "@/lib/db/repository";
import { createMemoryRepository } from "@/lib/db/memory-repository";
import { createSupabaseRepository } from "@/lib/db/supabase-repository";
import { seedDataset } from "@/lib/db/auto-seed";

/**
 * The in-memory repository is process-local, and Next.js gives Server
 * Components and Route Handlers separate module instances (each gets its
 * own copy of this file's top-level scope) -- a plain module-scope `let
 * cached` would give each of those instances its own, independent
 * repository object. That's not just a "seeded data looks empty"
 * cosmetic problem: it means a write made through one instance (e.g. a
 * POST /api/incidents/:id/investigate route handler saving an analysis
 * run) is genuinely invisible to a read made through another instance
 * (e.g. the incident detail Server Component page reading it back a
 * moment later) -- confirmed by instrumenting both paths directly.
 * `globalThis` is the fix: unlike module-scope bindings, it's shared by
 * every module instance within the same Node process, which is the
 * standard workaround for this exact class of Next.js dev-mode module
 * duplication (the same pattern commonly used for a singleton Prisma
 * client). This does not extend across genuinely separate serverless
 * invocations/processes on Vercel -- see the "Deploying to Vercel"
 * section of the README for that caveat, which globalThis cannot fix.
 */
const globalForRepository = globalThis as typeof globalThis & { __incidentInvestigatorRepository?: Repository };

/**
 * Every method call awaits the same one-shot seed promise before touching
 * the underlying store, so every module instance ends up with the same
 * deterministic dataset without changing getRepository()'s synchronous
 * signature.
 */
function withAutoSeed(repository: Repository): Repository {
  const seedPromise = seedDataset(repository).catch((error: unknown) => {
    console.error("Auto-seed of the in-memory repository failed:", error);
  });

  return new Proxy(repository, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        await seedPromise;
        return (value as (...fnArgs: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

export function getRepository(): Repository {
  if (globalForRepository.__incidentInvestigatorRepository) {
    return globalForRepository.__incidentInvestigatorRepository;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    globalForRepository.__incidentInvestigatorRepository = createSupabaseRepository(url, key);
    return globalForRepository.__incidentInvestigatorRepository;
  }

  const memory = createMemoryRepository();
  // Tests want a clean, explicitly-seeded repository per test -- Vitest
  // always sets process.env.VITEST, so auto-seed only applies to a real
  // running app.
  globalForRepository.__incidentInvestigatorRepository = process.env.VITEST === "true" ? memory : withAutoSeed(memory);
  return globalForRepository.__incidentInvestigatorRepository;
}

export function resetRepositoryForTests(): void {
  globalForRepository.__incidentInvestigatorRepository = undefined;
}
