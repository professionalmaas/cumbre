/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Prevent DNS prefetch leaking URLs
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // HSTS: 2 years, includes subdomains, preload-eligible
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // No embedding in foreign frames (clickjacking)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Prevent MIME sniffing (stops XSS via content-type confusion)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Leak only origin, never full URL, on cross-origin requests
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Opt out of browser features the app doesn't need
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  // CSP is now handled dynamically by middleware.ts (nonce-based; removes unsafe-inline).
  // Static fallback intentionally omitted here to avoid header conflicts.
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // NOTE: public-URL resolution behind the ALB (auth callbacks, presigned URLs, redirects)
  // is handled via NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL, not a config flag. A prior
  // `trustHost: true` here was a NextAuth-ism that Next.js 14 doesn't recognize — it was
  // silently ignored and only produced an "Unrecognized key" build warning, so it's removed.

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
