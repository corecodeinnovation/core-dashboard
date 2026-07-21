import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

// i18n sin prefijo de ruta (RF-10): el idioma viaja en una cookie, no en la
// URL — dash.corecodeinnovation.com se mantiene como único entry point, sin
// tocar las reglas del túnel de Cloudflare (/socket.io/* vs el resto).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
