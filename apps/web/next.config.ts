import type { NextConfig } from "next";

// Where the Next server proxies /api/* to. Evaluated when the server boots
// (rewrites run server-side at startup, not baked into static HTML), so it is
// runtime-configurable: localhost for local dev, the `api` service inside Docker,
// or any internal URL in production. WebSocket (/ws) is NOT proxied here — the
// browser connects directly using NEXT_PUBLIC_WS_URL.
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
