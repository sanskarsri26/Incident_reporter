import { validateAuthDbConfig } from "@/lib/config/validate-env";

/**
 * Runs once when a new Next.js server instance starts, before it accepts
 * any request (node_modules/next/dist/docs/.../instrumentation.md). This
 * is the fail-fast half of the auth/database config check -- getAuthProvider()
 * in lib/auth/index.ts also validates on every call as defense in depth for
 * code paths that don't go through a full server boot (tests, scripts).
 * Verified live: a throw here does not crash the `next start` process --
 * the server stays alive but is permanently wedged in a failed-prepare
 * state, and every HTTP request against it returns a 500 ("Failed to
 * prepare server" in the server log) rather than the process exiting or
 * restarting.
 */
export function register(): void {
  validateAuthDbConfig(process.env);
}
