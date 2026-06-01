// Supabase Edge Function: email a member when a notification row is inserted.
//
// Wire it up with a Database Webhook (Database → Webhooks) on
// public.notifications, event INSERT, type "Supabase Edge Functions",
// pointing at this function. Secrets required (supabase secrets set ...):
//   RESEND_API_KEY            – from your Resend account
//   NOTIFY_FROM               – e.g. "Travail Concierge <concierge@travailclub.com>"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy:  supabase functions deploy notify-email --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface NotificationRow {
  id: string
  member_id: string
  title: string
  body: string
  kind?: string
  ref?: Record<string, unknown> | null
}

// ─── Brand-aware CTA routing ────────────────────────────────────────────────

function ctaPath(record: NotificationRow): string {
  const ref = (record.ref ?? {}) as Record<string, unknown>
  const requesterId = ref.requester_id as string | undefined
  if ((record.kind === 'friend' || record.kind === 'contact') && requesterId) {
    return `/network/${requesterId}`
  }
  const itemKind = ref.item_kind as string | undefined
  const itemId = ref.item_id as string | undefined
  if (itemKind && itemId) return `/reserve/${itemId}?kind=${itemKind}`
  return '/notifications'
}

function ctaLabel(record: NotificationRow): string {
  switch (record.kind) {
    case 'friend':    return 'Review the request →'
    case 'contact':   return 'Review the request →'
    case 'booking':   return 'View booking →'
    case 'flight':    return 'See the flight →'
    case 'excursion': return 'See the excursion →'
    case 'approval':  return 'Review →'
    default:          return 'Open in the app →'
  }
}

// Eyebrow label + accent color per notification kind — gives the email
// a tiny content-aware tint without changing the layout.
function meta(record: NotificationRow): { eyebrow: string; accent: string; accentSoft: string } {
  switch (record.kind) {
    case 'friend':    return { eyebrow: 'A new connection',     accent: '#00b3c7', accentSoft: 'rgba(0,179,199,0.14)' }
    case 'contact':   return { eyebrow: 'Contact request',      accent: '#00b3c7', accentSoft: 'rgba(0,179,199,0.14)' }
    case 'booking':   return { eyebrow: 'Booking update',       accent: '#3e8c6d', accentSoft: 'rgba(62,140,109,0.14)' }
    case 'flight':    return { eyebrow: 'On the board',         accent: '#f4a72c', accentSoft: 'rgba(244,167,44,0.16)' }
    case 'excursion': return { eyebrow: 'On the board',         accent: '#f4a72c', accentSoft: 'rgba(244,167,44,0.16)' }
    case 'approval':  return { eyebrow: 'Approval needed',      accent: '#d94e2a', accentSoft: 'rgba(217,78,42,0.14)' }
    case 'system':    return { eyebrow: 'A note from concierge', accent: '#00b3c7', accentSoft: 'rgba(0,179,199,0.14)' }
    default:          return { eyebrow: 'Travail',               accent: '#00b3c7', accentSoft: 'rgba(0,179,199,0.14)' }
  }
}

// ─── Branded email shell ────────────────────────────────────────────────────
// Table-based layout for max email-client compatibility (Outlook, etc.).
// All styling inline; no <style> tags; web fonts limited to Georgia /
// system stacks because most clients strip @font-face.

function brandedEmail(p: {
  firstName: string
  eyebrow: string
  title: string
  body: string
  ctaLabel: string
  ctaHref: string
  accent: string
  accentSoft: string
}): string {
  const yr = new Date().getFullYear()
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light"/>
<title>${esc(p.title)}</title>
</head>
<body style="margin:0;padding:0;background:#fbf6ec;font-family:-apple-system,BlinkMacSystemFont,'Inter Tight','Inter','Segoe UI',sans-serif;color:#0d3340;-webkit-font-smoothing:antialiased;">
  <!-- Hidden preheader: shows in inbox previews. -->
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;visibility:hidden;mso-hide:all;">
    ${esc(p.body).slice(0, 140)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fbf6ec;">
    <tr><td align="center" style="padding:36px 14px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fffbf0;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(13,51,64,0.10),0 2px 6px rgba(13,51,64,0.04);">

        <!-- Header band with co-brand lockup -->
        <tr><td style="background:linear-gradient(135deg,#042128 0%,#0a3340 52%,#073744 100%);padding:26px 32px 24px;">
          <!-- Logo row: Travail wordmark × Tropic mark, with the
               kind-eyebrow on the right. -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
            <tr>
              <td align="left" valign="middle" style="line-height:0;">
                <img src="https://travailclub.com/travail-wordmark.png" alt="Travail" width="116" height="28" style="display:inline-block;height:28px;width:auto;vertical-align:middle;filter:brightness(0) invert(1);" />
                <span style="display:inline-block;color:rgba(251,246,236,0.45);font-family:Georgia,serif;font-style:italic;font-size:16px;margin:0 8px 0 10px;vertical-align:middle;line-height:1;">×</span>
                <img src="https://travailclub.com/tropic-logo.png" alt="Tropic Ocean Air" width="24" height="24" style="display:inline-block;height:24px;width:24px;vertical-align:middle;filter:brightness(0) invert(1);" />
              </td>
              <td align="right" valign="middle" style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:${p.accent};font-weight:700;">
                ${esc(p.eyebrow)}
              </td>
            </tr>
          </table>

          <!-- Headline -->
          <div style="font-family:Georgia,'Cormorant Garamond','Times New Roman',serif;font-style:italic;font-size:30px;line-height:1.12;color:#fffbf0;letter-spacing:-0.015em;">
            ${esc(p.title)}
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px 8px;">
          <p style="font-size:15px;line-height:1.6;color:#0d3340;margin:0 0 16px;">Hi ${esc(p.firstName)},</p>
          <p style="font-size:15.5px;line-height:1.65;color:#1f4b5b;margin:0 0 24px;">${esc(p.body)}</p>
        </td></tr>

        <!-- CTA -->
        <tr><td align="left" style="padding:0 32px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:${p.accent};border-radius:10px;">
              <a href="${esc(p.ctaHref)}" target="_blank" rel="noopener" style="display:inline-block;color:#ffffff;text-decoration:none;font-family:-apple-system,'Inter Tight','Inter','Segoe UI',sans-serif;font-weight:600;font-size:14px;letter-spacing:0.01em;padding:13px 22px;line-height:1;">
                ${esc(p.ctaLabel)}
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Tropic accent rule -->
        <tr><td style="padding:0 32px;">
          <div style="height:1px;background:linear-gradient(90deg,transparent 0%,${p.accentSoft} 25%,${p.accentSoft} 75%,transparent 100%);"></div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#7c9aa6;line-height:1.6;">
                Travail Members Club<br/>
                Private aviation &amp; experiences
              </td>
              <td align="right" style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#7c9aa6;">
                <a href="https://travailclub.com" target="_blank" rel="noopener" style="color:#0d3340;text-decoration:none;">travailclub.com</a>
              </td>
            </tr>
          </table>
        </td></tr>

      </table>

      <!-- Outer footnote -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin-top:16px;">
        <tr><td align="center" style="font-family:'JetBrains Mono','Courier New',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#9aa7ab;line-height:1.6;">
          You received this because you're a member. To stop these,<br/>
          turn off notifications under Account → Privacy in the app.<br/>
          <span style="color:#bfc8cc;">© ${yr} Travail Members Club</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Plain-text fallback ────────────────────────────────────────────────────

function plainText(p: {
  firstName: string
  title: string
  body: string
  ctaLabel: string
  ctaHref: string
}): string {
  return [
    `Hi ${p.firstName},`,
    '',
    p.body,
    '',
    `${p.ctaLabel} ${p.ctaHref}`,
    '',
    '—',
    'Travail Members Club',
    'travailclub.com',
  ].join('\n')
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const requiredSecret = Deno.env.get('NOTIFY_WEBHOOK_SECRET')
    if (requiredSecret && req.headers.get('x-webhook-secret') !== requiredSecret) {
      return new Response('unauthorized', { status: 401 })
    }

    const payload = await req.json()
    const record: NotificationRow | undefined = payload?.record
    if (!record?.member_id) {
      return new Response('no record', { status: 200 })
    }

    // Some notifications are emailed by the Next.js app pipeline instead (e.g.
    // the branded booking receipt) and flag themselves with ref.skip_email so
    // we don't double-send. The in-app notification row still stands.
    if (record.ref && (record.ref as Record<string, unknown>).skip_email) {
      return new Response('skipped (skip_email)', { status: 200 })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [{ data: member }, { data: sensitive }] = await Promise.all([
      admin.from('members').select('name').eq('id', record.member_id).single(),
      admin.from('member_sensitive').select('email').eq('member_id', record.member_id).maybeSingle(),
    ])

    const to = sensitive?.email
    if (!to) {
      return new Response('member has no email on file', { status: 200 })
    }

    const firstName = (member?.name ?? 'there').split(' ')[0]
    const from = Deno.env.get('NOTIFY_FROM') ?? 'Travail Concierge <concierge@travailclub.com>'
    const m = meta(record)
    const href = `https://travailclub.com${ctaPath(record)}`

    const html = brandedEmail({
      firstName,
      eyebrow: m.eyebrow,
      title: record.title,
      body: record.body,
      ctaLabel: ctaLabel(record),
      ctaHref: href,
      accent: m.accent,
      accentSoft: m.accentSoft,
    })

    const text = plainText({
      firstName,
      title: record.title,
      body: record.body,
      ctaLabel: ctaLabel(record),
      ctaHref: href,
    })

    // Paper trail: BCC ops on every notification email. Matches the
    // BCC the in-Next.js sendMemberMail() helper applies. Override via
    // OPS_PAPER_TRAIL_BCC; falls back to OPS_INBOX_EMAIL or the default.
    const opsBcc = (
      Deno.env.get('OPS_PAPER_TRAIL_BCC')
      ?? Deno.env.get('OPS_INBOX_EMAIL')
      ?? 'ops@travailclub.com'
    ).trim()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: record.title,
        html,
        text,
        ...(opsBcc ? { bcc: [opsBcc] } : {}),
      }),
    })

    // Structured audit row in email_log — best-effort, swallow errors so a
    // log failure never bounces the notification.
    let resendId: string | null = null
    let sendError: string | null = null
    if (res.ok) {
      try {
        const body = await res.clone().json()
        resendId = body?.id ?? null
      } catch { /* non-fatal */ }
    } else {
      try { sendError = await res.clone().text() } catch { sendError = `status ${res.status}` }
    }
    try {
      await admin.from('email_log').insert({
        kind: 'notify_email',
        member_id: record.member_id,
        to_email: to,
        subject: record.title,
        resend_id: resendId,
        refs: {
          notification_id: record.id,
          notification_kind: record.kind ?? null,
          ref: record.ref ?? null,
        },
        send_status: res.ok ? 'sent' : 'failed',
        send_error: sendError,
        bcc_ops: !!opsBcc,
      })
    } catch { /* don't let audit failure mask the real result */ }

    if (!res.ok) {
      return new Response(`email failed: ${sendError ?? 'unknown'}`, { status: 500 })
    }
    return new Response('sent', { status: 200 })
  } catch (e) {
    return new Response(`error: ${(e as Error).message}`, { status: 500 })
  }
})

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
