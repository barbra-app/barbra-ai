import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow large server actions for streaming tool outputs
    serverActions: { bodySizeLimit: "2mb" },
  },
  // firebase-admin/auth pulls in jwks-rsa -> jose, which ships ESM-only and
  // breaks when Next's bundler tries to require() it as an external chunk
  // (ERR_REQUIRE_ESM). Leaving the package external hands its own require()
  // calls to Node's native resolver instead, which handles the interop fine.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
