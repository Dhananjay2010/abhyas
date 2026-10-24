import { MetadataRoute } from "next";
import { branding } from "@/lib/branding";

/**
 * PWA manifest for Abhyas.
 *
 * Next.js 16 generates /manifest.webmanifest from this file.
 * Reads all values from src/lib/branding.ts so white-label deployments
 * can swap branding in one place.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: branding.name,
    short_name: branding.shortName,
    description: branding.description,
    start_url: "/",
    display: "standalone",
    background_color: branding.backgroundColor,
    theme_color: branding.themeColor,
    orientation: "portrait",
    icons: [
      {
        src: branding.icons.icon192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: branding.icons.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: branding.icons.maskable192,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: branding.icons.maskable512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["health", "fitness", "lifestyle"],
    shortcuts: [
      {
        name: "Today's Workout",
        short_name: "Today",
        description: "See today's training plan",
        url: "/today",
        icons: [{ src: branding.icons.icon192, sizes: "192x192" }],
      },
      {
        name: "Start Breathing",
        short_name: "Breathe",
        description: "Begin a breathing practice",
        url: "/breathe",
        icons: [{ src: branding.icons.icon192, sizes: "192x192" }],
      },
    ],
  };
}
