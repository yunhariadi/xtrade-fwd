import type { NextConfig } from "next";

// Where the Next server proxies /api/* to. NOTE: Next freezes rewrite
// destinations into the build manifest at BUILD time, so this must be set when
// `next build` runs (a Docker build arg), not at container start. Localhost for
// local dev; the `api` service name inside Docker. WebSocket (/ws) is NOT proxied
// here — the browser connects directly using NEXT_PUBLIC_WS_URL.
const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ?? "http://localhost:3001").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@ict-forward-lab/core"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
