import type { Repository } from "@/lib/db/repository";
import { createMemoryRepository } from "@/lib/db/memory-repository";
import { createSupabaseRepository } from "@/lib/db/supabase-repository";

let cached: Repository | null = null;

export function getRepository(): Repository {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  cached = url && key ? createSupabaseRepository(url, key) : createMemoryRepository();
  return cached;
}

export function resetRepositoryForTests(): void {
  cached = null;
}
