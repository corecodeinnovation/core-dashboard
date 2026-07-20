import type { NextConfig } from "next";

// REST del api vía mismo origen: el server de Next proxya /api/* hacia el
// gateway (dev: host; compose: red interna). El WS NO pasa por aquí (los
// rewrites no manejan el upgrade); va directo o por el túnel (/socket.io/*).
function apiInternalUrl(): string {
  if (process.env.API_INTERNAL_URL) return process.env.API_INTERNAL_URL;
  return process.env.NODE_ENV === "development" ? "http://localhost:3004" : "http://api:3000";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl()}/:path*` }];
  },
};

export default nextConfig;
