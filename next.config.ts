import type { NextConfig } from "next";

const commerceOrigin = "https://intent-commerce.gowtham0992.workers.dev";

const securityHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; frame-src 'none'; connect-src 'self' ${commerceOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'self'` },
  { key: "Permissions-Policy", value: "tools=(self)" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" }
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/.well-known/ucp", headers: [{ key: "Content-Type", value: "application/json; charset=utf-8" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
      { source: "/:path*", headers: securityHeaders }
    ];
  }
};

export default nextConfig;
