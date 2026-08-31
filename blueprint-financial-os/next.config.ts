import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `STATIC_EXPORT=1 npm run build` produces a fully static build in /out,
  // which scripts/bundle-single-file.js can collapse into one shareable
  // HTML file (see package.json "bundle"). Normal dev/start is unaffected.
  output: process.env.STATIC_EXPORT ? "export" : undefined,
};

export default nextConfig;
