// Branded transactional emails to members. Uses the same Resend account
// as the ops record-keeping pipeline (lib/ops-notify.ts) but sends to
// member's address with a member-facing tone — receipts, settlement
// breakdowns, important account events.
//
// Safe-fail: if RESEND_API_KEY isn't configured the email just doesn't
// send. The underlying transaction (settlement, booking, etc.) still
// completes and the in-app notification still fires.

import { Resend } from 'resend'
import { safeError } from '@/lib/pii-scrub'

const DEFAULT_FROM = 'Travail Concierge <concierge@travailclub.com>'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtMoney(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Trip cancelled by Travail email ───────────────────────────────────────
//
// Fired when Ops cancels a trip outright. Goes to both the anchor (full
// capture refund including the 3% service fee) and every affected pax
// (full paid amount refunded including their service fee). Travail eats
// the fee on a force-cancel — this email reassures the member that
// nothing was withheld.

export interface TripCancelledEmailParams {
  to: string
  memberName: string
  role: 'anchor' | 'pax'
  tripName: string
  tripDate?: string | null
  refundCents: number             // FULL refund amount, including fees
  refundId?: string | null
  confirmationCode?: string | null  // pax only
  reason?: string | null            // optional Ops note
}

export async function sendTripCancelledEmail(p: TripCancelledEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    safeError('sendTripCancelledEmail: RESEND_API_KEY not set; skipping', { to: p.to })
    return
  }

  const subject = p.refundCents > 0
    ? `${p.tripName} cancelled · ${fmtMoney(p.refundCents)} refunded`
    : `${p.tripName} cancelled`

  const text = [
    `${p.tripName} has been cancelled by Travail Ops.`,
    p.tripDate ? `Trip date: ${p.tripDate}` : null,
    '',
    p.refundCents > 0
      ? `A full refund of ${fmtMoney(p.refundCents)} has been issued to your card — including any service fees. Travail eats those on a force-cancel; you're not out anything.`
      : 'No payment was on file to refund.',
    '',
    p.reason ? `Reason from Ops: ${p.reason}` : null,
    p.refundId ? `Stripe refund: ${p.refundId}` : null,
    '',
    'Refunds typically appear on your card within 5–10 business days.',
    'Questions? Reply to this email and Ops will follow up.',
  ].filter(Boolean).join('\n')

  const html = brandedTripCancelledEmail(p)

  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [p.to],
      subject,
      html,
      text,
      replyTo: process.env.OPS_INBOX_EMAIL ?? 'ops@travailclub.com',
    })
  } catch (err) {
    safeError('sendTripCancelledEmail: send failed (non-fatal)', err)
  }
}

function brandedTripCancelledEmail(p: TripCancelledEmailParams): string {
  const headline = p.refundCents > 0
    ? `${fmtMoney(p.refundCents)} refunded`
    : 'Cancelled'
  const subhead = p.role === 'anchor'
    ? (p.refundCents > 0
        ? 'Your full capture — charter + 3% service fee — has been refunded.'
        : 'Your anchor was cancelled. No capture was on file to refund.')
    : (p.refundCents > 0
        ? `Your full payment, including any service fees, has been refunded.`
        : `Your reservation has been cancelled. No refund was needed.`)

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>${escapeHtml(p.tripName)} · Cancelled</title>
</head>
<body style="margin:0;padding:0;background:#fbf6ec;font-family:-apple-system,BlinkMacSystemFont,'Inter Tight','Inter','Segoe UI',sans-serif;color:#0d3340;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fbf6ec;padding:36px 14px 24px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;background:#fffbf0;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(13,51,64,0.10);">

        <!-- Header (signal-tinted gradient for cancel) -->
        <tr><td style="background:linear-gradient(135deg,#3a1410 0%,#5a201b 52%,#3a1812 100%);padding:32px 36px 28px;color:#fff;">
          <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#f4a72c;font-weight:700;margin-bottom:8px;">Trip cancelled</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.65);margin-bottom:14px;">${escapeHtml(p.tripName)}${p.tripDate ? ` · ${escapeHtml(p.tripDate)}` : ''}</div>
          <div style="font-size:38px;font-weight:700;color:#fff;letter-spacing:-0.022em;line-height:1;font-family:'Inter Tight',sans-serif;">${escapeHtml(headline)}</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.78);margin-top:14px;line-height:1.5;max-width:480px;">${escapeHtml(subhead)}</div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:24px 36px 4px;">
          <div style="font-size:15px;color:#1f4856;">Hi ${escapeHtml(p.memberName.split(' ')[0])},</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:8px 36px 22px;">
          <div style="font-size:14px;color:#1f4856;line-height:1.6;">
            ${p.role === 'anchor'
              ? `Travail Ops cancelled <strong>${escapeHtml(p.tripName)}</strong>. Because Travail initiated the cancel, your full capture has been refunded — including the 3% service fee that's normally non-refundable.`
              : `Travail Ops cancelled <strong>${escapeHtml(p.tripName)}</strong>. Because Travail initiated the cancel, your full payment has been refunded — including any service fees.`}
          </div>
          ${p.reason ? `<div style="background:rgba(244,167,44,0.08);border-left:3px solid #f4a72c;border-radius:0 8px 8px 0;padding:12px 14px;font-size:13px;color:#1f4b5b;line-height:1.55;margin-top:18px;">
            <strong style="color:#0d3340;font-weight:700;">Note from Ops:</strong> ${escapeHtml(p.reason)}
          </div>` : ''}
        </td></tr>

        <!-- Refund line -->
        ${p.refundCents > 0 ? `<tr><td style="padding:0 36px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(13,51,64,0.10);border-bottom:1px solid rgba(13,51,64,0.10);">
            <tr>
              <td style="padding:18px 0;font-family:'Inter Tight',sans-serif;font-size:14px;color:#0d3340;font-weight:700;">Refunded to your card</td>
              <td align="right" style="padding:18px 0;font-family:'Inter Tight',sans-serif;font-size:24px;font-weight:700;color:#3e8c6d;letter-spacing:-0.018em;">${fmtMoney(p.refundCents)}</td>
            </tr>
            ${p.confirmationCode ? `<tr>
              <td style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7c80;font-weight:600;border-top:1px solid rgba(13,51,64,0.06);">Confirmation</td>
              <td align="right" style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#c97e0e;letter-spacing:0.06em;border-top:1px solid rgba(13,51,64,0.06);">${escapeHtml(p.confirmationCode)}</td>
            </tr>` : ''}
            ${p.refundId ? `<tr>
              <td style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7c80;font-weight:600;border-top:1px solid rgba(13,51,64,0.06);">Stripe refund</td>
              <td align="right" style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:#1f4856;letter-spacing:0.04em;border-top:1px solid rgba(13,51,64,0.06);">${escapeHtml(p.refundId)}</td>
            </tr>` : ''}
          </table>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr><td style="padding:18px 36px 24px;border-top:1px solid rgba(13,51,64,0.08);">
          <div style="font-size:12.5px;color:#6b7c80;line-height:1.55;margin-bottom:10px;">Refunds typically land on your card within 5–10 business days depending on your card issuer. Questions? Reply to this email and Ops will follow up.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// ─── Pax trip-complete email ───────────────────────────────────────────────
//
// When a trip settles, every non-anchor member who had a paid seat gets
// a short branded note that the trip wrapped. No refund math — pax
// don't get rebated at settlement (their flat per-seat is what they
// owed). Just a closing receipt + confirmation code for their records.

export interface PaxTripCompleteParams {
  to: string
  memberName: string
  tripName: string
  tripDate?: string | null
  seats: number
  amountPaidCents: number
  confirmationCode?: string | null
}

export async function sendPaxTripCompleteEmail(p: PaxTripCompleteParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    safeError('sendPaxTripCompleteEmail: RESEND_API_KEY not set; skipping', { to: p.to })
    return
  }

  const subject = `${p.tripName} · trip wrapped`
  const text = [
    `${p.tripName} has wrapped.`,
    p.tripDate ? `Trip date: ${p.tripDate}` : null,
    '',
    `Seats: ${p.seats}`,
    `Total paid: ${fmtMoney(p.amountPaidCents)}`,
    p.confirmationCode ? `Confirmation: ${p.confirmationCode}` : null,
    '',
    'Thanks for joining. If you have questions about your trip or a receipt request, reply to this email.',
  ].filter(Boolean).join('\n')

  const html = brandedPaxTripCompleteEmail(p)

  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [p.to],
      subject,
      html,
      text,
      replyTo: process.env.OPS_INBOX_EMAIL ?? 'ops@travailclub.com',
    })
  } catch (err) {
    safeError('sendPaxTripCompleteEmail: send failed (non-fatal)', err)
  }
}

function brandedPaxTripCompleteEmail(p: PaxTripCompleteParams): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>${escapeHtml(p.tripName)} · Wrapped</title>
</head>
<body style="margin:0;padding:0;background:#fbf6ec;font-family:-apple-system,BlinkMacSystemFont,'Inter Tight','Inter','Segoe UI',sans-serif;color:#0d3340;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fbf6ec;padding:36px 14px 24px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fffbf0;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(13,51,64,0.10);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#042128 0%,#0a3340 52%,#073744 100%);padding:32px 36px 26px;color:#fff;">
          <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#00b3c7;font-weight:700;margin-bottom:8px;">Trip wrapped</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.65);margin-bottom:12px;">${escapeHtml(p.tripName)}${p.tripDate ? ` · ${escapeHtml(p.tripDate)}` : ''}</div>
          <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.018em;line-height:1.15;">Thanks for joining.</div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:24px 36px 4px;">
          <div style="font-size:15px;color:#1f4856;">Hi ${escapeHtml(p.memberName.split(' ')[0])},</div>
        </td></tr>

        <!-- Receipt summary -->
        <tr><td style="padding:8px 36px 22px;">
          <div style="font-size:14px;color:#1f4856;line-height:1.55;margin-bottom:18px;">Your trip has officially closed. Here's your receipt for the books.</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(13,51,64,0.10);border-bottom:1px solid rgba(13,51,64,0.10);">
            <tr><td style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7c80;font-weight:600;">Seats</td><td align="right" style="padding:12px 0;font-size:14px;font-weight:700;">${p.seats}</td></tr>
            <tr><td style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7c80;font-weight:600;border-top:1px solid rgba(13,51,64,0.06);">Total paid</td><td align="right" style="padding:12px 0;font-size:18px;font-weight:700;letter-spacing:-0.012em;border-top:1px solid rgba(13,51,64,0.06);">${fmtMoney(p.amountPaidCents)}</td></tr>
            ${p.confirmationCode ? `<tr><td style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7c80;font-weight:600;border-top:1px solid rgba(13,51,64,0.06);">Confirmation</td><td align="right" style="padding:12px 0;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#c97e0e;letter-spacing:0.06em;border-top:1px solid rgba(13,51,64,0.06);">${escapeHtml(p.confirmationCode)}</td></tr>` : ''}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 36px 24px;border-top:1px solid rgba(13,51,64,0.08);">
          <div style="font-size:12.5px;color:#6b7c80;line-height:1.55;">Questions about your trip or need a different receipt format? Reply to this email and Ops will follow up.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// ─── Settlement email ──────────────────────────────────────────────────────

export interface SettlementEmailParams {
  to: string                    // anchor's email
  memberName: string            // "Griffin Goudreau"
  tripName: string              // "Lobster Mini Season · Key West"
  tripDate?: string | null
  charterTotalCents: number     // what was captured at publish (charter + fee)
  charterCostCents?: number | null  // Tropic bare charter cost (charter portion only); null for legacy rows
  serviceFeeCents?: number | null   // 3% anchor service fee (Travail margin)
  paidRevenueCents: number      // sum of pax payments + forfeits (charter portion only)
  anchorRefundCents: number     // what's being refunded back (capped at paid_revenue)
  anchorNetPaidCents: number    // final amount anchor was billed
  refundId?: string | null      // Stripe refund id (for the audit line)
  paxSeatsSold: number          // # of seats sold to non-anchor members
  perSeatCents: number          // price per seat at publish time
  anchorSeats: number           // how many seats the anchor kept
}

export async function sendSettlementEmail(p: SettlementEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    safeError('sendSettlementEmail: RESEND_API_KEY not set; skipping member email', { to: p.to })
    return
  }

  const filled = p.anchorRefundCents > 0 && p.paxSeatsSold > 0
  const fullFill = p.paxSeatsSold > 0 && p.anchorNetPaidCents === (p.perSeatCents * p.anchorSeats)
  const subject = filled
    ? `${p.tripName} · ${fmtMoney(p.anchorRefundCents)} refunded`
    : `${p.tripName} · settled`

  const text = [
    `${p.tripName} has settled.`,
    p.tripDate ? `Trip date: ${p.tripDate}` : null,
    '',
    '──────────────────────────────────────────',
    `Charter captured at publish:  ${fmtMoney(p.charterTotalCents)}`,
    `Pax revenue collected:        ${fmtMoney(p.paidRevenueCents)} (${p.paxSeatsSold} seat${p.paxSeatsSold === 1 ? '' : 's'} at ${fmtMoney(p.perSeatCents)})`,
    `Refunded to your card:        ${fmtMoney(p.anchorRefundCents)}`,
    `Your final cost:              ${fmtMoney(p.anchorNetPaidCents)}`,
    '──────────────────────────────────────────',
    '',
    fullFill
      ? `The trip filled completely — your final cost was just your own ${p.anchorSeats} seat${p.anchorSeats === 1 ? '' : 's'}.`
      : filled
      ? `${p.paxSeatsSold} pax seat${p.paxSeatsSold === 1 ? '' : 's'} sold at ${fmtMoney(p.perSeatCents)} each. Your refund covers what the network filled; you're responsible for your own ${p.anchorSeats} seat${p.anchorSeats === 1 ? '' : 's'} plus any that didn't sell.`
      : `No other members booked, so you paid the full charter cost. The hold on your card has been released.`,
    '',
    p.refundId ? `Stripe refund id: ${p.refundId}` : null,
    '',
    'Questions? Reply to this email and Ops will follow up.',
  ].filter(Boolean).join('\n')

  const html = brandedSettlementEmail(p, filled, fullFill)

  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [p.to],
      subject,
      html,
      text,
      replyTo: process.env.OPS_INBOX_EMAIL ?? 'ops@travailclub.com',
    })
  } catch (err) {
    safeError('sendSettlementEmail: send failed (non-fatal)', err)
  }
}

function row(label: string, valueHtml: string, accent?: 'in' | 'out' | 'neutral'): string {
  const valueColor = accent === 'in' ? '#3e8c6d' : accent === 'out' ? '#c97e0e' : '#0d3340'
  return `<tr>
    <td style="padding:10px 0;font-family:'JetBrains Mono','Courier New',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7c80;font-weight:600;border-bottom:1px solid rgba(13,51,64,0.06);">${escapeHtml(label)}</td>
    <td align="right" style="padding:10px 0;font-family:'Inter Tight',-apple-system,sans-serif;font-size:16px;font-weight:700;color:${valueColor};border-bottom:1px solid rgba(13,51,64,0.06);">${valueHtml}</td>
  </tr>`
}

function brandedSettlementEmail(p: SettlementEmailParams, filled: boolean, fullFill: boolean): string {
  const headline = filled
    ? `${fmtMoney(p.anchorRefundCents)} refunded`
    : 'Settled'
  const subhead = fullFill
    ? `The trip filled. You're paying for your ${p.anchorSeats} seat${p.anchorSeats === 1 ? '' : 's'} and nothing more.`
    : filled
    ? `${p.paxSeatsSold} pax seat${p.paxSeatsSold === 1 ? '' : 's'} sold at ${fmtMoney(p.perSeatCents)} each. Refund covers what the network filled.`
    : `No other members booked. You paid the full charter cost; the hold on your card has been released.`

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>${escapeHtml(p.tripName)} · Settled</title>
</head>
<body style="margin:0;padding:0;background:#fbf6ec;font-family:-apple-system,BlinkMacSystemFont,'Inter Tight','Inter','Segoe UI',sans-serif;color:#0d3340;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fbf6ec;padding:36px 14px 24px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;background:#fffbf0;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(13,51,64,0.10);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#042128 0%,#0a3340 52%,#073744 100%);padding:32px 36px 28px;color:#fff;position:relative;">
          <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#00b3c7;font-weight:700;margin-bottom:8px;">Trip settled</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.65);margin-bottom:14px;">${escapeHtml(p.tripName)}${p.tripDate ? ` · ${escapeHtml(p.tripDate)}` : ''}</div>
          <div style="font-size:38px;font-weight:700;color:#fff;letter-spacing:-0.022em;line-height:1;font-family:'Inter Tight',sans-serif;">
            ${escapeHtml(headline)}
          </div>
          <div style="font-size:14px;color:rgba(255,255,255,0.78);margin-top:14px;line-height:1.5;max-width:480px;">${escapeHtml(subhead)}</div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:24px 36px 4px;">
          <div style="font-size:15px;color:#1f4856;">${escapeHtml(p.memberName.split(' ')[0])},</div>
        </td></tr>

        <!-- Breakdown -->
        <tr><td style="padding:8px 36px 24px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7c80;font-weight:700;margin-bottom:14px;">The breakdown</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${p.charterCostCents != null && p.serviceFeeCents != null && p.serviceFeeCents > 0 ? `
              ${row('Charter (Tropic + operators)', fmtMoney(p.charterCostCents))}
              ${row('Travail service fee (3%)', fmtMoney(p.serviceFeeCents))}
              ${row('Captured at publish', fmtMoney(p.charterTotalCents))}
            ` : row('Charter captured at publish', fmtMoney(p.charterTotalCents))}
            ${row(`Pax revenue (${p.paxSeatsSold} seat${p.paxSeatsSold === 1 ? '' : 's'})`, fmtMoney(p.paidRevenueCents), 'in')}
            ${row('Refunded to your card', '−' + fmtMoney(p.anchorRefundCents), 'out')}
            <tr>
              <td style="padding:14px 0 0;font-family:'Inter Tight',sans-serif;font-size:14px;color:#0d3340;font-weight:700;">Your final cost</td>
              <td align="right" style="padding:14px 0 0;font-family:'Inter Tight',sans-serif;font-size:22px;font-weight:700;color:#0d3340;letter-spacing:-0.018em;">${fmtMoney(p.anchorNetPaidCents)}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Explainer panel -->
        <tr><td style="padding:6px 36px 24px;">
          <div style="background:rgba(0,179,199,0.06);border-left:3px solid #00b3c7;border-radius:0 8px 8px 0;padding:14px 16px;font-size:13px;color:#1f4b5b;line-height:1.55;">
            <strong style="color:#0d3340;font-weight:700;">How the math works.</strong> When you anchored the trip we captured ${fmtMoney(p.charterTotalCents)} on your card${p.serviceFeeCents && p.serviceFeeCents > 0 ? ` — the ${fmtMoney(p.charterCostCents ?? 0)} charter plus the 3% Travail service fee` : ''}. As members booked, the charter portion of their seats covered cost; that's what's refunded to you at trip departure. You're always responsible for your own seat${p.anchorSeats === 1 ? '' : 's'} and any that didn't sell${p.serviceFeeCents && p.serviceFeeCents > 0 ? ', plus the service fee' : ''}.
          </div>
        </td></tr>

        ${p.refundId ? `<tr><td style="padding:0 36px 20px;">
          <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#7c9aa6;">
            Stripe refund · <span style="color:#1f4856;">${escapeHtml(p.refundId)}</span>
          </div>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr><td style="padding:18px 36px 24px;border-top:1px solid rgba(13,51,64,0.08);">
          <div style="font-size:12.5px;color:#6b7c80;line-height:1.55;margin-bottom:10px;">
            Refunds usually land within 5–10 business days depending on your card issuer. Questions? Reply to this email and Ops will follow up.
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9.5px;letter-spacing:0.18em;text-transform:uppercase;color:#7c9aa6;">
                Travail · Settlement
              </td>
              <td align="right" style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:#7c9aa6;">
                ${escapeHtml(new Date().toLocaleString('en-US', { dateStyle: 'long' }))}
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
