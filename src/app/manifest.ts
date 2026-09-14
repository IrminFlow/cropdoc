import type { MetadataRoute } from "next";
// Lets growers add CropDoc to their home screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CropDoc",
    short_name: "CropDoc",
    description:
      "Take a photo of a sick crop. Learn what may be wrong and what to do next.",
    start_url: "/upload",
    display: "standalone",
    background_color: "#edf2e5",
    theme_color: "#176443",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
