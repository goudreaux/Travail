// Email notifications to the Ops inbox for record-keeping.
//
// Every money-moving event (Stripe charge, refund, dispute) and every
// significant client request (anchor submission, contact form) goes
// through here. Ops sets Gmail push notifications on the inbox so
// nothing falls through the cracks.
//
// Required env:
//   RESEND_API_KEY  — same key used by the contact form
//   RESEND_FROM     — verified sender (defaults to concierge@travailclub.com)
//   OPS_INBOX_EMAIL — defaults to ops@travailclub.com
//
// Safe-fail by design: a failed ops email never breaks the underlying
// flow. Errors are scrubbed to the server log via safeError and the
// caller continues. If accounting needs to backfill, they'll catch it
// in the Stripe dashboard or the activity_log table.

import { Resend } from 'resend'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

const DEFAULT_FROM = 'Travail Concierge <concierge@travailclub.com>'
const DEFAULT_TO = 'ops@travailclub.com'

// Best-effort row into public.email_log. Service-role only. Swallows
// errors — a failed audit row must never break an ops notification.
async function logOpsEmail(row: {
  to: string
  subject: string
  resendId: string | null
  kind: OpsNotifyKind
  refs: Record<string, unknown>
  status: 'sent' | 'failed'
  error: string | null
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  try {
    const admin = createAdminClient<Database>(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('email_log').insert({
      kind: 'ops_notify',
      member_id: null,    // ops emails aren't addressed to a member
      to_email: row.to,
      subject: row.subject,
      resend_id: row.resendId,
      refs: { ops_kind: row.kind, ...row.refs },
      send_status: row.status,
      send_error: row.error,
      bcc_ops: false,
    })
  } catch (err) {
    safeError('logOpsEmail: insert failed (non-fatal)', err)
  }
}

export type OpsNotifyKind =
  | 'anchor_capture'        // Anchor charged for full charter at publish
  | 'pax_booking'           // Pax charged for seat at reserve
  | 'anchor_settlement'     // Anchor refunded at trip departure
  | 'pax_cancel_refund'     // Pax cancellation outside 72h — refunded
  | 'pax_cancel_forfeit'    // Pax cancellation inside 72h — no refund
  | 'payment_failed'        // Stripe declined a charge
  | 'payment_dispute'       // Stripe chargeback initiated
  | 'anchor_submission'     // New anchor pending Ops review
  | 'proposal_submission'   // New Trip Proposal pending Ops review (Kickstarter-style)
  | 'member_contact'        // Member sent a note via /contact
  | 'subscription_started'        // New member's first invoice paid
  | 'subscription_payment_failed' // Renewal failed — ops calls to resolve
  | 'subscription_cancelled'      // Sub cancelled (member-initiated via phone, or auto-cancel after dunning)
  | 'proposal_withdrawn'          // Proposer/committer withdrew from a Trip Proposal

export interface OpsNotifyOptions {
  kind: OpsNotifyKind
  // Member who triggered the event (for the email header + audit trail).
  member?: { name?: string | null; memberCode?: string | null; email?: string | null }
  // Trip / item the event relates to.
  item?: { kind?: 'flight' | 'excursion'; id?: string | null; name?: string | null; date?: string | null }
  // Money — cents. Set for any billing event. Sign convention:
  // positive = leaving Travail's books toward member (refund), negative
  // = arriving on Travail's books from member (charge). Display layer
  // normalizes for the human reader.
  amountCents?: number | null
  // Stripe references (so ops can click straight into the dashboard row).
  stripe?: { paymentIntentId?: string | null; refundId?: string | null; chargeId?: string | null; customerId?: string | null }
  // Free-form structured note — rendered as a small block in the body.
  note?: string | null
  // Any extra fields to dump into a key/value details table. Each value
  // is rendered as text — pass already-formatted strings.
  details?: Record<string, string | number | null | undefined>
}

const KIND_META: Record<OpsNotifyKind, { label: string; accent: string; sign: 'in' | 'out' | 'neutral' }> = {
  anchor_capture:       { label: 'ANCHOR CHARTER CAPTURED',  accent: '#00b3c7', sign: 'in' },
  pax_booking:          { label: 'PAX SEAT BOOKED',          accent: '#3e8c6d', sign: 'in' },
  anchor_settlement:    { label: 'ANCHOR SETTLEMENT REFUND', accent: '#3e8c6d', sign: 'out' },
  pax_cancel_refund:    { label: 'CANCELLATION REFUND',      accent: '#c97e0e', sign: 'out' },
  pax_cancel_forfeit:   { label: 'CANCELLATION FORFEIT',     accent: '#c97e0e', sign: 'neutral' },
  payment_failed:       { label: 'PAYMENT FAILED',           accent: '#d94e2a', sign: 'neutral' },
  payment_dispute:      { label: 'PAYMENT DISPUTE',          accent: '#d94e2a', sign: 'neutral' },
  anchor_submission:           { label: 'NEW ANCHOR SUBMISSION',    accent: '#f4a72c', sign: 'neutral' },
  proposal_submission:         { label: 'NEW TRIP PROPOSAL',        accent: '#e09418', sign: 'neutral' },
  member_contact:              { label: 'MEMBER CONTACT',           accent: '#7c9aa6', sign: 'neutral' },
  subscription_started:        { label: 'MEMBERSHIP STARTED',       accent: '#3e8c6d', sign: 'in' },
  subscription_payment_failed: { label: 'MEMBERSHIP PAYMENT FAILED', accent: '#d94e2a', sign: 'neutral' },
  subscription_cancelled:      { label: 'MEMBERSHIP CANCELLED',     accent: '#c97e0e', sign: 'neutral' },
  proposal_withdrawn:          { label: 'TRIP PROPOSAL WITHDRAWN',  accent: '#c97e0e', sign: 'neutral' },
}

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '—'
  const dollars = Math.abs(cents) / 100
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripeDashboardUrl(pi?: string | null, refundId?: string | null, customerId?: string | null): string | null {
  // Test-mode and live-mode URLs share the same base; the dashboard
  // resolves the right environment by the object id prefix.
  if (pi) return `https://dashboard.stripe.com/payments/${pi}`
  if (refundId) return `https://dashboard.stripe.com/refunds/${refundId}`
  if (customerId) return `https://dashboard.stripe.com/customers/${customerId}`
  return null
}

export async function notifyOps(opts: OpsNotifyOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Don't fail the underlying flow — just log and move on. Accounting
    // can still reconcile via Stripe and the activity_log table.
    safeError('notifyOps: RESEND_API_KEY not set; skipping ops notification', { kind: opts.kind })
    return
  }

  const meta = KIND_META[opts.kind]
  const memberName = opts.member?.name ?? 'Unknown member'
  const amountStr = fmtMoney(opts.amountCents)
  const ts = new Date()
  const tsHuman = ts.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })

  // Greppable subject for Gmail filters / push routing. Each major
  // category gets a prefix tag.
  const tag = meta.sign === 'in' ? '[CHARGE]' : meta.sign === 'out' ? '[REFUND]' : '[OPS]'
  const subject = `${tag} ${meta.label} · ${memberName}${opts.amountCents != null ? ` · ${amountStr}` : ''}`

  // Plain-text version — for accounting copy-paste / mobile-Gmail
  // preview / for clients that strip HTML.
  const textLines: string[] = [
    meta.label,
    '',
    `Member: ${memberName}${opts.member?.memberCode ? ` (${opts.member.memberCode})` : ''}`,
  ]
  if (opts.member?.email) textLines.push(`Email:  ${opts.member.email}`)
  if (opts.amountCents != null) textLines.push(`Amount: ${amountStr}`)
  if (opts.item?.name) textLines.push(`Trip:   ${opts.item.name}${opts.item.date ? ` · ${opts.item.date}` : ''}`)
  if (opts.item?.id) textLines.push(`Item:   ${opts.item.kind ?? 'item'} ${opts.item.id}`)
  if (opts.stripe?.paymentIntentId) textLines.push(`PI:     ${opts.stripe.paymentIntentId}`)
  if (opts.stripe?.refundId) textLines.push(`Refund: ${opts.stripe.refundId}`)
  if (opts.stripe?.customerId) textLines.push(`Cust:   ${opts.stripe.customerId}`)
  if (opts.details) {
    for (const [k, v] of Object.entries(opts.details)) {
      if (v == null || v === '') continue
      textLines.push(`${k}: ${v}`)
    }
  }
  if (opts.note) {
    textLines.push('')
    textLines.push('Note:')
    textLines.push(opts.note)
  }
  textLines.push('')
  textLines.push(`Logged at ${tsHuman}`)
  const text = textLines.join('\n')

  const html = brandedOpsEmail({ ...opts, meta, memberName, amountStr, tsHuman })

  const resend = new Resend(apiKey)
  const to = process.env.OPS_INBOX_EMAIL ?? DEFAULT_TO
  const refs: Record<string, unknown> = {
    member_code: opts.member?.memberCode ?? null,
    member_email: opts.member?.email ?? null,
    item_kind: opts.item?.kind ?? null,
    item_id: opts.item?.id ?? null,
    item_name: opts.item?.name ?? null,
    amount_cents: opts.amountCents ?? null,
    payment_intent_id: opts.stripe?.paymentIntentId ?? null,
    refund_id: opts.stripe?.refundId ?? null,
    charge_id: opts.stripe?.chargeId ?? null,
    customer_id: opts.stripe?.customerId ?? null,
  }
  try {
    const res = await resend.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
    })
    const resendId = (res as { data?: { id?: string | null } | null })?.data?.id ?? null
    await logOpsEmail({ to, subject, resendId, kind: opts.kind, refs, status: 'sent', error: null })
  } catch (err) {
    // Never bubble a notification failure into the underlying flow.
    safeError('notifyOps: send failed (non-fatal)', err)
    await logOpsEmail({
      to, subject, resendId: null, kind: opts.kind, refs,
      status: 'failed', error: err instanceof Error ? err.message : String(err),
    })
  }
}

interface BrandedOpsEmailParams {
  meta: { label: string; accent: string; sign: 'in' | 'out' | 'neutral' }
  kind: OpsNotifyKind
  memberName: string
  amountStr: string
  tsHuman: string
  member?: OpsNotifyOptions['member']
  item?: OpsNotifyOptions['item']
  amountCents?: number | null
  stripe?: OpsNotifyOptions['stripe']
  note?: string | null
  details?: OpsNotifyOptions['details']
}

function brandedOpsEmail(p: BrandedOpsEmailParams): string {
  const stripeUrl = stripeDashboardUrl(p.stripe?.paymentIntentId, p.stripe?.refundId, p.stripe?.customerId)
  const memberLabel = p.member?.memberCode ? `${p.memberName} · ${p.member.memberCode}` : p.memberName
  const showAmount = p.amountCents != null

  const rows: string[] = []
  if (p.member?.email) rows.push(detailRow('Email', p.member.email))
  if (p.item?.name) {
    const tripVal = p.item.date ? `${p.item.name} · ${p.item.date}` : p.item.name
    rows.push(detailRow('Trip', tripVal))
  }
  if (p.item?.id) rows.push(detailRow(p.item.kind ? p.item.kind.charAt(0).toUpperCase() + p.item.kind.slice(1) + ' id' : 'Item id', p.item.id))
  if (p.stripe?.paymentIntentId) rows.push(detailRow('PaymentIntent', `<code style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(p.stripe.paymentIntentId)}</code>`))
  if (p.stripe?.refundId) rows.push(detailRow('Refund', `<code style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(p.stripe.refundId)}</code>`))
  if (p.stripe?.customerId) rows.push(detailRow('Customer', `<code style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(p.stripe.customerId)}</code>`))
  if (p.details) {
    for (const [k, v] of Object.entries(p.details)) {
      if (v == null || v === '') continue
      rows.push(detailRow(k, escapeHtml(String(v))))
    }
  }

  const amountColor = p.meta.sign === 'in' ? '#3e8c6d' : p.meta.sign === 'out' ? '#c97e0e' : '#0d3340'
  const amountPrefix = p.meta.sign === 'in' ? '+' : p.meta.sign === 'out' ? '−' : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>${escapeHtml(p.meta.label)} · ${escapeHtml(p.memberName)}</title>
</head>
<body style="margin:0;padding:0;background:#fbf6ec;font-family:-apple-system,BlinkMacSystemFont,'Inter Tight','Inter','Segoe UI',sans-serif;color:#0d3340;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fbf6ec;padding:36px 14px 24px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fffbf0;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(13,51,64,0.10);">

        <!-- Header band -->
        <tr><td style="background:linear-gradient(135deg,#042128 0%,#0a3340 52%,#073744 100%);padding:24px 32px;color:#fff;">
          <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:${p.meta.accent};font-weight:700;margin-bottom:6px;">Concierge record · for the books</div>
          <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.018em;line-height:1.1;">${escapeHtml(p.meta.label)}</div>
        </td></tr>

        ${showAmount ? `
        <!-- Amount headline -->
        <tr><td style="padding:24px 32px 16px;background:#fffbf0;border-bottom:1px solid rgba(13,51,64,0.08);">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7c80;font-weight:600;margin-bottom:8px;">Amount</div>
          <div style="font-size:34px;font-weight:700;color:${amountColor};letter-spacing:-0.022em;line-height:1;font-family:'Inter Tight',sans-serif;">
            ${amountPrefix}${escapeHtml(p.amountStr)}
          </div>
        </td></tr>
        ` : ''}

        <!-- Member -->
        <tr><td style="padding:18px 32px 6px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7c80;font-weight:600;margin-bottom:6px;">Member</div>
          <div style="font-size:16px;font-weight:600;color:#0d3340;">${escapeHtml(memberLabel)}</div>
        </td></tr>

        <!-- Details table -->
        ${rows.length ? `<tr><td style="padding:8px 32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows.join('')}
          </table>
        </td></tr>` : ''}

        ${p.note ? `<tr><td style="padding:0 32px 18px;">
          <div style="background:rgba(0,179,199,0.06);border-left:3px solid #00b3c7;border-radius:0 8px 8px 0;padding:12px 14px;font-size:13.5px;color:#1f4b5b;line-height:1.55;white-space:pre-wrap;">${escapeHtml(p.note)}</div>
        </td></tr>` : ''}

        ${stripeUrl ? `<tr><td style="padding:4px 32px 24px;">
          <a href="${escapeHtml(stripeUrl)}" style="display:inline-block;padding:10px 16px;background:#0d3340;color:#fff;text-decoration:none;border-radius:9px;font-size:13px;font-weight:600;font-family:'Inter Tight',sans-serif;letter-spacing:0.01em;">Open in Stripe →</a>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr><td style="padding:14px 32px 20px;border-top:1px solid rgba(13,51,64,0.08);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#7c9aa6;line-height:1.6;">
                Travail · Concierge Ledger
              </td>
              <td align="right" style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#7c9aa6;">
                ${escapeHtml(p.tsHuman)}
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function detailRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#6b7c80;font-weight:600;white-space:nowrap;vertical-align:top;width:1%;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:13.5px;color:#0d3340;line-height:1.45;word-break:break-word;">${valueHtml}</td>
  </tr>`
}
