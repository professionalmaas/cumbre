/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles only the required files and a minimal server.
  // The Dockerfile copies .next/standalone + .next/static + public.
  output: "standalone",

  reactStrictMode: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
