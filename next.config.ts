import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a parent package-lock.json exists
  // higher up, which otherwise confuses Turbopack's root inference).
  turbopack: {
    root: import.meta.dirname,
  },
  // @react-pdf/renderer is a heavy Node-only dependency; keep it external so
  // Turbopack/Next doesn't try to bundle it into the server build.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
