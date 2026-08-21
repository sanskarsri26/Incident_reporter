import type { Repository } from "@/lib/db/repository";
import { createMemoryRepository } from "@/lib/db/memory-repository";
import { createSupabaseRepository } from "@/lib/db/supabase-repository";
import { seedDataset } from "@/lib/db/auto-seed";

let cached: Repository | null = null;

/**
 * The in-memory repository is process-local, and Next.js gives Server
 * Components and Route Handlers separate module instances (each gets its
 * own copy of this file's `cached` variable), so nothing else ever seeds
 * it -- without this, `npm run dev`/`npm run start` with no Supabase
 * configured would show an empty app forever, even after running
 * `npm run seed` (which seeds a *different*, short-lived process). Every
 * method call awaits the same one-shot seed promise before touching the
 * underlying store, so every module instance ends up with the same
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
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    cached = createSupabaseRepository(url, key);
    return cached;
  }

  const memory = createMemoryRepository();
  // Tests want a clean, explicitly-seeded repository per test -- Vitest
  // always sets process.env.VITEST, so auto-seed only applies to a real
  // running app.
  cached = process.env.VITEST === "true" ? memory : withAutoSeed(memory);
  return cached;
}

export function resetRepositoryForTests(): void {
  cached = null;
}
