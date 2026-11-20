import type { NextConfig } from "next";
import path from "node:path";

// The browser calls /api/v1/* on this app's own origin; Next proxies it to the
// NestJS API so session cookies and CSRF stay same-origin. This value is read
// at build time (standalone output).
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiInternalUrl}/api/v1/:path*`,
      },
    ];
  },
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
