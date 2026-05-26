import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

// Member contact form → branded email to ops.
//
// The member is signed in, so we never trust the client for identity —
// we look them up from the Supabase session and stamp their name / email /
// member code onto the email so ops always knows exactly who's writing.
//
// Required env vars:
//   RESEND_API_KEY        — Resend API key (server-side only)
//   RESEND_FROM           — verified Resend sender, e.g.
//                           "Travail Concierge <concierge@travailclub.com>"
//   OPS_INBOX_EMAIL       — recipient address (defaults to ops@travailclub.com)

export const runtime = 'nodejs'

const DEFAULT_FROM = 'Travail Concierge <concierge@travailclub.com>'
const DEFAULT_TO = 'ops@travailclub.com'

interface ContactPayload {
  subject?: string
  message?: string
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  let payload: ContactPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const message = (payload.message ?? '').trim()
  const subject = (payload.subject ?? '').trim() || 'New message'
  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }
  if (message.length > 6000) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('name, member_no, tier')
    .eq('user_id', user.id)
    .single()

  const memberName = member?.name ?? user.email ?? 'Member'
  const memberEmail = user.email ?? ''
  const memberCode = member?.member_no ? `#${member.member_no}` : ''
  const memberPhone = ''
  const memberTier = member?.tier ?? ''

  const html = brandedEmail({
    memberName,
    memberEmail,
    memberCode,
    memberPhone,
    memberTier,
    subject,
    message,
  })

  const text = [
    `From: ${memberName} <${memberEmail}>`,
    memberCode ? `Member: ${memberCode}` : null,
    memberPhone ? `Phone: ${memberPhone}` : null,
    '',
    `Subject: ${subject}`,
    '',
    message,
  ].filter(Boolean).join('\n')

  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [process.env.OPS_INBOX_EMAIL ?? DEFAULT_TO],
      replyTo: memberEmail || undefined,
      subject: `${memberName} · ${subject}`,
      html,
      text,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'send failed'
    return NextResponse.json({ error: detail }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function brandedEmail(p: {
  memberName: string
  memberEmail: string
  memberCode: string
  memberPhone: string
  memberTier: string
  subject: string
  message: string
}): string {
  const messageHtml = escapeHtml(p.message).replace(/\n/g, '<br/>')
  const ts = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(p.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fbf6ec;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#0d3340;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fbf6ec;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fffbf0;border-radius:16px;overflow:hidden;box-shadow:0 16px 44px rgba(13,51,64,0.10);">

        <!-- Header band -->
        <tr><td style="background:linear-gradient(135deg,#042128 0%,#0a3340 52%,#073744 100%);padding:28px 32px;color:#fff;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#00b3c7;font-weight:600;margin-bottom:8px;">Travail Concierge</div>
          <div style="font-family:Georgia,'Cormorant Garamond',serif;font-style:italic;font-size:26px;line-height:1.1;color:#fff;letter-spacing:-0.015em;">A note from a member.</div>
        </td></tr>

        <!-- Member identity -->
        <tr><td style="padding:24px 32px 12px;border-bottom:1px solid rgba(13,51,64,0.10);">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7c80;font-weight:600;margin-bottom:6px;">From</div>
          <div style="font-size:17px;font-weight:600;color:#0d3340;line-height:1.3;">${escapeHtml(p.memberName)}${p.memberCode ? ` <span style="color:#6b7c80;font-weight:500;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:0.08em;">${escapeHtml(p.memberCode)}</span>` : ''}</div>
          <div style="font-size:13px;color:#6b7c80;margin-top:4px;">${escapeHtml(p.memberEmail)}${p.memberPhone ? ` · ${escapeHtml(p.memberPhone)}` : ''}${p.memberTier ? ` · ${escapeHtml(p.memberTier)}` : ''}</div>
        </td></tr>

        <!-- Subject -->
        <tr><td style="padding:20px 32px 8px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7c80;font-weight:600;margin-bottom:6px;">Subject</div>
          <div style="font-size:18px;font-weight:600;color:#0d3340;line-height:1.3;">${escapeHtml(p.subject)}</div>
        </td></tr>

        <!-- Message -->
        <tr><td style="padding:16px 32px 28px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7c80;font-weight:600;margin-bottom:10px;">Message</div>
          <div style="font-size:15px;color:#0d3340;line-height:1.6;white-space:pre-wrap;background:#fbf6ec;padding:18px 20px;border-radius:10px;border:1px solid rgba(13,51,64,0.08);">${messageHtml}</div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(13,51,64,0.08);font-size:11px;color:#9aa7ab;font-family:'JetBrains Mono',monospace;letter-spacing:0.10em;">
          Sent via travailclub.com · ${escapeHtml(ts)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
