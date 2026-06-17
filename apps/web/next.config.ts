import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ict-forward-lab/core"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
      // Note: WebSocket connections (/ws) connect directly to the API server
      // at ws://localhost:3001/ws since Next.js rewrites don't support WS protocol.
    ];
  },
};

export default nextConfig;
