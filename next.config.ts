import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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
