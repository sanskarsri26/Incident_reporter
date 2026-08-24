import { cookies } from "next/headers";
import { getAuthProvider } from "@/lib/auth/index";
import type { AuthUser } from "@/lib/auth/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const provider = getAuthProvider({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
        }
      } catch {
        // Server Components can't set cookies -- proxy.ts refreshes
        // the session on the next navigation instead.
      }
    },
  });
  return provider.getUser();
}
