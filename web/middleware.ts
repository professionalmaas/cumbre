import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' trusts scripts loaded by nonce-authenticated scripts (React, dynamic imports).
    // 'https:' is a fallback for older browsers that don't understand strict-dynamic.
    // This removes 'unsafe-inline' from script execution entirely.
    `script-src 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    [
      "connect-src 'self'",
      "https://*.stripe.com https://api.stripe.com",
      "https://*.amazoncognito.com",
      `https://dataplane.rum.us-east-1.amazonaws.com`,
      `https://client.rum.us-east-1.amazonaws.com`,
    ].join(' '),
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ')

  // Attach nonce to the request so Next.js propagates it to its own inline hydration scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)

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
