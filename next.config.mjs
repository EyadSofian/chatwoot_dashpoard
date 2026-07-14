/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma must stay external so the query engine binary is not bundled by webpack.
  serverExternalPackages: ["@prisma/client", "prisma"],
  output: "standalone",
  eslint: {
    // Lint is run separately in CI; do not block production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
