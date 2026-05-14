import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const scriptSrc = ["'self'", "'unsafe-inline'"];
const connectSrc = ["'self'", "https:"];

if (!isProduction) {
  scriptSrc.push("'unsafe-eval'");
  connectSrc.push("ws:");
}

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      [
        "default-src 'self'",
        `script-src ${scriptSrc.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        `connect-src ${connectSrc.join(" ")}`,
        "font-src 'self' https: data:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
