// Supabase Edge Function: email a member when a notification row is inserted.
//
// Wire it up with a Database Webhook (Database → Webhooks) on
// public.notifications, event INSERT, type "Supabase Edge Functions",
// pointing at this function. Secrets required (supabase secrets set ...):
//   RESEND_API_KEY            – from your Resend account
//   NOTIFY_FROM               – e.g. "Travail Ops <ops@travailclub.com>"
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

// Where the email's call-to-action should land, based on the notification.
// Friend + contact requests deep-link to the requester's profile so the
// recipient can act in one tap — the profile already has Accept/Decline.
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
  if (record.kind === 'friend') return 'Review the request →'
  if (record.kind === 'contact') return 'Review the request →'
  return 'View in the app →'
}

Deno.serve(async (req) => {
  try {
    // Optional shared-secret gate. Set the NOTIFY_WEBHOOK_SECRET function secret
    // and add a matching `x-webhook-secret` header to the Database Webhook to
    // stop anyone who finds the URL from triggering emails. No-op until set.
    const requiredSecret = Deno.env.get('NOTIFY_WEBHOOK_SECRET')
    if (requiredSecret && req.headers.get('x-webhook-secret') !== requiredSecret) {
      return new Response('unauthorized', { status: 401 })
    }

    const payload = await req.json()
    const record: NotificationRow | undefined = payload?.record
    if (!record?.member_id) {
      return new Response('no record', { status: 200 })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Member display name + email (email lives in member_sensitive).
    const [{ data: member }, { data: sensitive }] = await Promise.all([
      admin.from('members').select('name').eq('id', record.member_id).single(),
      admin.from('member_sensitive').select('email').eq('member_id', record.member_id).maybeSingle(),
    ])

    const to = sensitive?.email
    if (!to) {
      return new Response('member has no email on file', { status: 200 })
    }

    const firstName = (member?.name ?? 'there').split(' ')[0]
    const from = Deno.env.get('NOTIFY_FROM') ?? 'Travail Ops <ops@travailclub.com>'

    const html = `
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#0d3340">
        <div style="background:#0d3340;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0">
          <div style="font-size:13px;letter-spacing:.14em;color:#00b3c7">TRAVAIL</div>
          <div style="font-size:22px;margin-top:4px">${escapeHtml(record.title)}</div>
        </div>
        <div style="background:#fff;border:1px solid #e7ded0;border-top:none;padding:24px;border-radius:0 0 14px 14px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 22px">${escapeHtml(record.body)}</p>
          <a href="https://travailclub.com${ctaPath(record)}" style="display:inline-block;background:#00b3c7;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px">${ctaLabel(record)}</a>
        </div>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject: record.title, html }),
    })

    if (!res.ok) {
      return new Response(`email failed: ${await res.text()}`, { status: 500 })
    }
    return new Response('sent', { status: 200 })
  } catch (e) {
    return new Response(`error: ${(e as Error).message}`, { status: 500 })
  }
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
