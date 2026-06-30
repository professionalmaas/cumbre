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
  // CSP: locks down script/style/frame sources.
  // unsafe-inline is required for Next.js hydration inline scripts and Tailwind inline styles.
  // Nonce-based CSP (tighter) requires middleware and is a future hardening step.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://*.stripe.com https://api.stripe.com https://*.amazoncognito.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
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
