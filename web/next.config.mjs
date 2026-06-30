/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles only the required files and a minimal server.
  // The Dockerfile copies .next/standalone + .next/static + public.
  output: "standalone",

  reactStrictMode: true,

  // Trust X-Forwarded-Host/Proto from the ALB so request.url in route handlers
  // reflects the public URL (https://getcumbre.com) rather than the container's
  // internal address (http://0.0.0.0:3000). Required for auth callbacks behind a proxy.
  trustHost: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
