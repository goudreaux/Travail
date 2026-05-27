// PII scrubber — walks any value (errors, Supabase error objects,
// fetch responses, plain objects) and redacts known-sensitive keys
// and patterns before the value is logged. Two front doors:
//
//   safeError(label, err)        — drop-in replacement for console.error
//                                  that scrubs the error payload first.
//   sentryBeforeSend(event, hint)— pass-through into Sentry.init when we
//                                  wire it up. Returns a scrubbed event.
//
// Why both: even before Sentry exists, console.error output ends up in
// Vercel function logs, which we don't want carrying member emails,
// phone numbers, or Stripe IDs.

// Field names we never want to log. Compared case-insensitively.
const PII_KEYS = new Set([
  'email',
  'phone',
  'phonenumber',
  'phone_number',
  'date_of_birth',
  'dob',
  'birthdate',
  'birth_date',
  'passport',
  'passport_number',
  'ssn',
  'social_security',
  'card_last4',
  'last4',
  'address',
  'street',
  'street1',
  'street2',
  'postal_code',
  'postal',
  'zip',
  'zipcode',
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'api_key',
  'apikey',
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_payment_intent_id',
])

// Patterns scrubbed inside free-form strings (error messages, hints).
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g
// Phone-like: 7+ digits with optional separators/parentheses.
const PHONE_RE = /(?:\+?\d[\s\-().]{0,2}){7,}\d/g
// 13–19 contiguous digits (loose card-number heuristic).
const CARD_RE = /\b\d{13,19}\b/g
// Bearer / JWT-ish tokens.
const TOKEN_RE = /\b(?:Bearer\s+|eyJ)[A-Za-z0-9\-_.=]{10,}\b/g

const REDACTED = '[redacted]'

function scrubString(s: string): string {
  return s
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, REDACTED)
    .replace(CARD_RE, REDACTED)
    .replace(TOKEN_RE, REDACTED)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Returns a deep-cloned copy of `value` with PII keys and patterns redacted. */
export function scrub<T = unknown>(value: T, depth = 0): T {
  // Belt-and-braces against pathological inputs (cycles, huge objects).
  if (depth > 8) return REDACTED as unknown as T

  if (value == null) return value
  if (typeof value === 'string') return scrubString(value) as unknown as T
  if (typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map(v => scrub(v, depth + 1)) as unknown as T
  }

  // Errors aren't plain objects but have enumerable name/message + a
  // bunch of optional fields (Supabase errors carry .details / .hint /
  // .code, fetch errors carry .cause). Flatten to a plain object first.
  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: scrubString(value.message ?? ''),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = value as any
    for (const k of ['code', 'details', 'hint', 'status', 'cause']) {
      if (anyErr[k] !== undefined) out[k] = scrub(anyErr[k], depth + 1)
    }
    return out as unknown as T
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        out[k] = REDACTED
      } else {
        out[k] = scrub(v, depth + 1)
      }
    }
    return out as unknown as T
  }

  // Non-plain object (Date, Map, etc.) — pass through unchanged.
  return value
}

/**
 * Scrubbed replacement for console.error. Use anywhere we currently log
 * a server error that might carry a Supabase row, a Stripe payload, or a
 * fetch response — i.e. anywhere PII could ride along.
 */
export function safeError(label: string, err: unknown): void {
  // Always emit the label as-is; only the payload gets scrubbed.
  console.error(label, scrub(err))
}

/**
 * Drop-in beforeSend for Sentry.init({ beforeSend }). Walks event.exception,
 * event.message, event.extra, event.contexts, event.request and scrubs them
 * before the event is shipped to Sentry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sentryBeforeSend(event: any): any {
  if (!event || typeof event !== 'object') return event
  if (event.message) event.message = scrubString(String(event.message))
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((v: Record<string, unknown>) => ({
      ...v,
      value: typeof v.value === 'string' ? scrubString(v.value) : v.value,
    }))
  }
  if (event.extra) event.extra = scrub(event.extra)
  if (event.contexts) event.contexts = scrub(event.contexts)
  if (event.request) {
    event.request = scrub(event.request)
    // Belt-and-braces: drop cookies/headers entirely.
    if (event.request.cookies) event.request.cookies = REDACTED
    if (event.request.headers) {
      const h: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(event.request.headers as Record<string, unknown>)) {
        h[k] = PII_KEYS.has(k.toLowerCase()) ? REDACTED : v
      }
      event.request.headers = h
    }
  }
  return event
}
