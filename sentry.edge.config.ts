// Sentry — Edge runtime (Vercel Edge Functions, edge middleware).
import * as Sentry from '@sentry/nextjs'
import { sentryBeforeSend } from '@/lib/pii-scrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
  debug: false,
  enabled: process.env.NODE_ENV === 'production',

  beforeSend: sentryBeforeSend,
})
