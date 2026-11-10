import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships a native addon (dlopen'd libvips .so) — bundling it like
  // regular JS breaks that lookup at runtime ("Failed to load external
  // module sharp..."). Leaving it external makes Next resolve it as a plain
  // node_modules require, which Vercel's build correctly traces and ships
  // alongside the platform-matching binary.
  serverExternalPackages: ["sharp"],

  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/sharp-libvips-*/lib/*.so*"],
  },
  experimental: {
    // Allow large server actions for streaming tool outputs
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
