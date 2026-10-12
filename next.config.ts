import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The handoff emails link to /calls/<id>; the transcript lives in the signed-in console.
  redirects: async () => [{ source: "/calls/:id", destination: "/console/calls/:id", permanent: false }],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
