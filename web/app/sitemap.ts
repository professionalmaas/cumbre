import type { MetadataRoute } from "next";

// Public, indexable routes only. Per-user and sample-detail pages are intentionally excluded.
const BASE =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://getcumbre.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/plans`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/sample/ridge`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/sample/lantern`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/legal/dmca`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/legal/aup`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
