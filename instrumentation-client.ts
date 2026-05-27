// Sentry — browser bundle. Runs once when the page boots.
// PII scrubbing happens in sentryBeforeSend before any event leaves
// the device.
import * as Sentry from '@sentry/nextjs'
import { sentryBeforeSend } from '@/lib/pii-scrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Throttle perf traces — errors are the priority, traces eat quota.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  // Session replay is off by default; flip on once we're paying for it.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Silence the SDK's own console chatter in prod.
  debug: false,

  // Suppress events when running locally so dev errors don't churn quota.
  enabled: process.env.NODE_ENV === 'production',

  // Last-line PII guard before transport.
  beforeSend: sentryBeforeSend,
})

// Required for App Router navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
