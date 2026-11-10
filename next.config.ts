import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships a native addon (dlopen'd libvips .so) — bundling it like
  // regular JS breaks that lookup at runtime ("Failed to load external
  // module sharp..."). Leaving it external makes Next resolve it as a plain
  // node_modules require, which Vercel's build correctly traces and ships
  // alongside the platform-matching binary.
  serverExternalPackages: ["sharp"],
  // serverExternalPackages alone still wasn't enough on Vercel — the trace
  // step that decides which files ship with each serverless function missed
  // sharp's platform-specific native binary (pnpm nests it deep under
  // node_modules/.pnpm/@img+sharp-*), so the function had the JS but not the
  // .so it dlopen's at runtime. Force-including the whole package tree here
  // guarantees the binary actually ships.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  experimental: {
    // Allow large server actions for streaming tool outputs
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
