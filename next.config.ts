import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const tileHost = (() => {
  try {
    return new URL((process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png").replace(/\{[a-z]\}/g, "a")).origin;
  } catch {
    return "https://tile.openstreetmap.org";
  }
})();

/**
 * Static CSP (no nonces) so partial prerendering keeps working — see Next's CSP guide, "Without Nonces".
 * Images: own uploads, data/blob previews, map tiles and Vercel Blob (when configured).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${tileHost} https://*.public.blob.vercel-storage.com`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Geolocation is needed for QR check-in at the duty point; camera for future QR scanning.
    value: "geolocation=(self), camera=(self), microphone=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["pg", "@react-pdf/renderer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
