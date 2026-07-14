import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma must stay external so the query engine binary is not bundled by webpack.
  serverExternalPackages: ["@prisma/client", "prisma"],
  output: "standalone",
  // Pin the tracing root. Without this Next walks up looking for a lockfile and
  // can pick a parent directory (a stray package-lock.json in the user's home is
  // enough), which nests the standalone output under the project's relative path
  // — so `.next/standalone/server.js` isn't where the Dockerfile expects it.
  outputFileTracingRoot: projectRoot,
  eslint: {
    // Lint is run separately in CI; do not block production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
