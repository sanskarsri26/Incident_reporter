import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    exclude: ["**/node_modules/**", "**/.next/**", "**/.claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      exclude: [
        "**/node_modules/**",
        "**/.next/**",
        "**/.claude/**",
        "**/tests/**",
        "**/data/**",
        "**/*.config.ts",
        "**/*.config.mjs",
        "next-env.d.ts",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
