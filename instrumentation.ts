// Next.js instrumentation hook — runs once at server start. Loads the
// runtime-appropriate Sentry config (Node vs Edge). The client config
// lives in /instrumentation-client.ts.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown inside React Server Components / route handlers
// so they surface in Sentry with the right request context.
export const onRequestError = Sentry.captureRequestError
