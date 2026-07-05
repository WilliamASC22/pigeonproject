import { NextRequest, NextResponse } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

function getSupabaseOrigin() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    return "https://*.supabase.co";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "https://*.supabase.co";
  }
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const supabaseOrigin = getSupabaseOrigin();

  const connectSources = [
    "'self'",
    supabaseOrigin,
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "stun:",
    "turn:"
  ];

  if (isDev) {
    connectSources.push(
      "http://localhost:*",
      "ws://localhost:*",
      "http://127.0.0.1:*",
      "ws://127.0.0.1:*"
    );
  }

  const scriptSources = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net"
    : `'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.jsdelivr.net`;

  const styleSources = isDev
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline'";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    `style-src ${styleSources}`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "frame-src 'none'",
    isDev ? "" : "upgrade-insecure-requests"
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  response.headers.set("Content-Security-Policy", csp);

  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Download-Options", "noopen");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  response.headers.set(
    "Permissions-Policy",
    [
      "camera=(self)",
      "microphone=(self)",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "bluetooth=()",
      "serial=()",
      "hid=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "fullscreen=(self)"
    ].join(", ")
  );

  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};