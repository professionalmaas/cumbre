import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cumbre — Get your song to the summit",
    short_name: "Cumbre",
    description:
      "An AI climbing guide for your song: a genre-aware craft grade, your Top 3 fixes, and the route to the summit.",
    theme_color: "#0d0a06",
    background_color: "#0d0a06",
    display: "standalone",
    start_url: "/",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
