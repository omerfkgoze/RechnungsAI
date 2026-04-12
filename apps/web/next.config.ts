import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@rechnungsai/shared"],
};

export default nextConfig;
