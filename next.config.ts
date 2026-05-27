import type { NextConfig } from 'next'

// Security headers — applied on every response from Next so the entire
// app sits behind a baseline of browser-level protections (clickjacking,
// MIME sniffing, mixed content, etc.). The CSP is intentionally strict:
// only the third parties we actually call (Supabase + Stripe + Google
// Fonts) are allow-listed.
//
// Notes:
//   - script-src needs 'unsafe-inline' for Next.js's inline hydration
//     bootstrap. We can tighten this with per-request nonces via
//     middleware later — for now this still blocks any externally hosted
//     script that isn't on the allow list.
//   - 'unsafe-eval' is dev-only (Webpack HMR + React Refresh use it).
//   - 'frame-ancestors none' is the modern equivalent of
//     X-Frame-Options DENY; we keep both for legacy crawlers.
const isProd = process.env.NODE_ENV === 'production'

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isProd ? '' : "'unsafe-eval'"} https://js.stripe.com`.replace(/\s+/g, ' ').trim(),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob:",
  // Supabase REST + realtime WS + Stripe XHR. Add other origins here as
  // we wire them in (never widen with wildcards beyond the host root).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
  // Stripe Elements + 3DS challenge iframes.
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  // Force HTTPS for two years + opt in to the browser preload list. Only
  // emit in prod so local dev over http://localhost doesn't break.
  ...(isProd ? [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }] : []),
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Drop powerful features we never use. Payment stays self + Stripe so
  // Stripe Elements can call the Payment Request API.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com"), interest-cohort=()',
  },
  { key: 'Content-Security-Policy', value: csp },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
