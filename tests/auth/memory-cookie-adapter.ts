import type { CookieAdapter } from "@/lib/auth/cookie-adapter";

export function createMemoryCookieAdapter(): {
  adapter: CookieAdapter;
  setCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>;
} {
  const jar = new Map<string, string>();
  const setCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  return {
    setCookies,
    adapter: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          jar.set(name, value);
          setCookies.push({ name, value, options });
        }
      },
    },
  };
}
