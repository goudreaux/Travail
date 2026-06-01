// Member invitation email — the "Email invite" action in the ops dashboard.
//
// Unlike the transactional emails in member-email.ts (which deliberately send
// only to the ops paper-trail address), an invite MUST reach the member, so we
// send straight to their inbox via Resend from the branded Concierge sender.
// The link points at /join?code=… — a code WE control, redeemed server-side,
// with none of the auth-magic-link fragility.

import { Resend } from 'resend'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { safeError } from '@/lib/pii-scrub'
import type { Database } from '@/lib/supabase/types'

const FROM = 'Travail Concierge <concierge@travailclub.com>'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface InviteEmailParams {
  to: string
  memberName: string
  joinUrl: string
  code: string
  memberId?: string | null
  // 'invite' = first-time onboarding; 'reset' = existing member setting a new
  // password. Same /join link (which resets the password for an existing
  // login), different copy. Defaults to 'invite'.
  purpose?: 'invite' | 'reset'
}

export async function sendInviteLinkEmail(p: InviteEmailParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'Email is not configured (RESEND_API_KEY missing).' }

  const isReset = p.purpose === 'reset'
  const first = p.memberName.trim().split(/\s+/)[0] || 'there'
  const subject = isReset ? 'Reset your Travail password' : 'Your invitation to Travail'
  const text = (isReset
    ? [
        `Hi ${first},`,
        '',
        'Use this link to set a new password for your Travail account:',
        p.joinUrl,
        '',
        `If the link doesn't open, go to travailclub.com/join and enter this code: ${p.code}`,
        '',
        'If you didn’t request this, you can safely ignore this email.',
      ]
    : [
        `Hi ${first},`,
        '',
        "You're invited to Travail. Set up your account here:",
        p.joinUrl,
        '',
        `If the link doesn't open, go to travailclub.com/join and enter this code: ${p.code}`,
        '',
        'This invitation is just for you. See you inside.',
      ]
  ).join('\n')

  const html = brandedInviteEmail(p, first, isReset)

  try {
    const resend = new Resend(apiKey)
    const res = await resend.emails.send({ from: FROM, to: [p.to], subject, html, text, replyTo: process.env.OPS_INBOX_EMAIL ?? 'ops@travailclub.com' })
    const resendId = (res as { data?: { id?: string | null } | null })?.data?.id ?? null
    await logInvite(p, 'sent', resendId, null, subject)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logInvite(p, 'failed', null, msg, subject)
    return { ok: false, error: msg }
  }
}

async function logInvite(p: InviteEmailParams, status: 'sent' | 'failed', resendId: string | null, error: string | null, subject: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  try {
    const admin = createAdminClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('email_log').insert({
      kind: 'member_invite',
      member_id: p.memberId ?? null,
      to_email: p.to,
      subject,
      resend_id: resendId,
      refs: { join_url: p.joinUrl, purpose: p.purpose ?? 'invite' },
      send_status: status,
      send_error: error,
      bcc_ops: false,
    })
  } catch (e) {
    safeError('logInvite: insert failed (non-fatal)', e)
  }
}

function brandedInviteEmail(p: InviteEmailParams, first: string, isReset: boolean): string {
  const eyebrow = isReset ? 'Account access' : 'By private invitation'
  const heading = isReset ? 'Reset your password.' : 'Welcome to Travail.'
  const intro = isReset
    ? 'Tap below to set a new password for your account. The link works once and is good for 30 days.'
    : 'You&rsquo;ve been invited to Travail &mdash; private aviation and curated experiences with a small, vetted network. Tap below to set up your account; it takes about a minute.'
  const cta = isReset ? 'Set a new password &rarr;' : 'Set up your account &rarr;'
  const footnote = isReset
    ? 'If you didn&rsquo;t ask to reset your password, you can safely ignore this email. Questions? Reply and Ops will follow up.'
    : 'This invitation is just for you and expires in 30 days. Questions? Reply to this email and Ops will follow up.'
  const title = isReset ? 'Reset your Travail password' : 'Your invitation to Travail'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#fbf6ec;font-family:-apple-system,BlinkMacSystemFont,'Inter Tight','Inter','Segoe UI',sans-serif;color:#0d3340;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fbf6ec;padding:36px 14px 24px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;background:#fffbf0;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(13,51,64,0.10);">
        <tr><td style="background:linear-gradient(135deg,#042128 0%,#0a3340 52%,#073744 100%);padding:34px 36px 30px;color:#fff;">
          <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#00b3c7;font-weight:700;margin-bottom:10px;">${eyebrow}</div>
          <div style="font-size:32px;font-weight:700;color:#fff;letter-spacing:-0.022em;line-height:1.05;font-family:'Inter Tight',sans-serif;">${heading}</div>
        </td></tr>
        <tr><td style="padding:26px 36px 6px;"><div style="font-size:15px;color:#1f4856;">Hi ${esc(first)},</div></td></tr>
        <tr><td style="padding:8px 36px 18px;">
          <div style="font-size:14px;color:#1f4856;line-height:1.65;">${intro}</div>
        </td></tr>
        <tr><td style="padding:4px 36px 22px;">
          <a href="${esc(p.joinUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 26px;background:#00b3c7;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;font-family:'Inter Tight',sans-serif;letter-spacing:-0.005em;">${cta}</a>
        </td></tr>
        <tr><td style="padding:0 36px 24px;">
          <div style="font-size:12.5px;color:#6b7c80;line-height:1.55;">If the button doesn&rsquo;t work, go to <a href="https://travailclub.com/join" style="color:#0d7a8c;">travailclub.com/join</a> and enter this code:</div>
          <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:20px;font-weight:700;letter-spacing:0.12em;color:#0d3340;background:rgba(0,179,199,0.08);border-radius:10px;padding:12px 16px;text-align:center;margin-top:10px;">${esc(p.code)}</div>
        </td></tr>
        <tr><td style="padding:14px 36px 24px;border-top:1px solid rgba(13,51,64,0.08);">
          <div style="font-size:12px;color:#6b7c80;line-height:1.55;">${footnote}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
