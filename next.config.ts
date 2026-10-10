import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Pages are statically prerendered; without this the client router keeps
    // them in cache for 5 min and revisiting restores the old page state
    // (e.g. a finished test) instead of the idle screen.
    staleTimes: { static: 0 },
  },
  // transformers.js is imported inside Web Workers only; keep node-only
  // packages out of any bundle path that might resolve them.
  serverExternalPackages: ["onnxruntime-node", "sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: {
      // Browser bundles never need these node backends.
      sharp: "./src/shims/empty.ts",
      "onnxruntime-node": "./src/shims/empty.ts",
    },
  },
};

export default nextConfig;
