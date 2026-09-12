import { validateAuthDbConfig } from "@/lib/config/validate-env";

/**
 * Runs once when a new Next.js server instance starts, before it accepts
 * any request (node_modules/next/dist/docs/.../instrumentation.md). This
 * is the fail-fast half of the auth/database config check -- getAuthProvider()
 * in lib/auth/index.ts also validates on every call as defense in depth for
 * code paths that don't go through a full server boot (tests, scripts).
 */
export function register(): void {
  validateAuthDbConfig(process.env);
}
