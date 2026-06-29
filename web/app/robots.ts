import type { MetadataRoute } from "next";

// Crawl rules: let bots index the public marketing/sample surface, keep the authenticated
// app + API + per-user report/profile/upload paths out of the index.
const BASE =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/plans", "/legal", "/sample/", "/share/"],
      disallow: ["/admin", "/api", "/report", "/profile", "/upload"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
