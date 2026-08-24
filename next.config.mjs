// Content-Security-Policy. Nonce-based CSP would need per-request nonce
// generation wired through proxy.ts into the rendered HTML -- this
// project's proxy.ts exists only for auth session refresh and route
// gating (see proxy.ts), not response rewriting, so this still uses
// the static, no-nonce CSP Next.js documents as the supported alternative
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
// "Without Nonces" section).
//
// 'unsafe-inline' is included in script-src and style-src as a documented
// last resort, not an oversight:
//   - script-src: Next.js's App Router streams React Server Component
//     payloads to the client via small inline `<script>self.__next_f.push(...)
//     </script>` tags emitted directly in the HTML (hydration data), which a
//     strict script-src without 'unsafe-inline' or a nonce would block.
//   - style-src: `recharts` (used by AccuracyBarChart/PairedBarChart/
//     SeverityChart) sets inline `style` attributes at runtime (e.g. its
//     ResponsiveContainer sizes itself via style="width:...;height:...") for
//     layout, which style-src also gates.
// This app has no client-side fetch() calls to any external host -- every
// fetch() in components/ hits this app's own /api/* routes -- so
// connect-src is 'self' only, and there are no third-party script/style/font
// origins to allow-list anywhere in this policy.
const isDev = process.env.NODE_ENV === "development";
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "Content-Security-Policy", value: cspHeader },
        ],
      },
    ];
  },
};

export default nextConfig;
