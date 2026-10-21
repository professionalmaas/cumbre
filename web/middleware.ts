import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' trusts scripts loaded by nonce-authenticated scripts (React, dynamic imports).
    // 'https:' is a fallback for older browsers that don't understand strict-dynamic.
    // This removes 'unsafe-inline' from script execution entirely.
    // Next dev's refresh runtime evaluates strings. Production builds do not, so
    // unsafe-eval stays off outside development.
    [
      `script-src 'nonce-${nonce}' 'strict-dynamic'`,
      process.env.NODE_ENV === "development" ? "'unsafe-eval'" : "",
      "https:",
    ]
      .filter(Boolean)
      .join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    [
      "connect-src 'self'",
      "https://*.stripe.com https://api.stripe.com",
      "https://*.amazoncognito.com",
      // Browser PUTs the audio directly to the S3 uploads bucket via a presigned URL
      // (virtual-hosted style, e.g. <bucket>.s3.us-east-1.amazonaws.com). Both the
      // region-scoped and legacy region-less forms are allowed since the SDK may emit
      // either. WITHOUT THIS the upload fetch is blocked by CSP and throws — surfacing
      // as "Upload didn't go through" with no server-side error.
      "https://*.s3.amazonaws.com https://*.s3.us-east-1.amazonaws.com",
      `https://dataplane.rum.us-east-1.amazonaws.com`,
      `https://client.rum.us-east-1.amazonaws.com`,
    ].join(' '),
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  // On http://localhost this directive rewrites audio/image requests to https, and nothing
  // is listening there, so sample playback fails. Keep it for every public host.
  const host = request.nextUrl.hostname
  if (host !== "localhost" && host !== "127.0.0.1") {
    csp.push("upgrade-insecure-requests")
  }
  const cspHeader = csp.join('; ')

  // Attach nonce to the request so Next.js propagates it to its own inline hydration scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', cspHeader)

  return response
}

// Run on all page/API routes; skip static assets and RSC prefetches.
export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
