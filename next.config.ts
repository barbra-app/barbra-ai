import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow large server actions for streaming tool outputs
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
