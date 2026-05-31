'use client'
import { useEffect, useState } from 'react'
import PageHero from '@/components/PageHero'
import { createClient } from '@/lib/supabase/client'
import { useMember } from '@/lib/member-context'
import { OPS_PHONE, OPS_PHONE_DISPLAY, OPS_HOURS } from '@/lib/contact'

const SUBJECTS = [
  'Booking change',
  'Trip request',
  'Membership question',
  'Something else',
] as const

type Subject = typeof SUBJECTS[number]

export default function ContactPage() {
  const supabase = createClient()
  const { member } = useMember()
  const memberName = member?.name ?? null
  const [memberEmail, setMemberEmail] = useState<string | null>(null)
  const [subject, setSubject] = useState<Subject>(SUBJECTS[0])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Name comes from the shared member context; the email lives on the auth
  // session (not the members row), so read it locally — getSession is a cookie
  // read, no network round-trip.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setMemberEmail(session?.user?.email ?? null)
    })
    return () => { cancelled = true }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/contact/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, message: message.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not send')
      }
      setSent(true)
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page">
      <PageHero
        accent="signal"
        eyebrow="Concierge"
        title="Operations Team"
        sub="Drop us a line, we'll take care of the rest. Replies usually within minutes during desk hours."
      />

      <div className="page-view contact-page">
        {sent ? (
          <SentState memberName={memberName} onAgain={() => setSent(false)} />
        ) : (
          <form className="contact-form" onSubmit={handleSubmit}>
            {/* Identity badge: ops will know exactly who's writing */}
            <div className="contact-sender">
              <div className="contact-sender__label">Sending as</div>
              <div className="contact-sender__name">
                {memberName ?? 'You'}
                {memberEmail && <span className="contact-sender__email">{memberEmail}</span>}
              </div>
            </div>

            {/* Subject — pill picker rather than a dropdown for iOS feel */}
            <div className="contact-field">
              <label className="contact-label">What's this about?</label>
              <div className="contact-subjects">
                {SUBJECTS.map(s => (
                  <button
                    type="button"
                    key={s}
                    className={`contact-subject${s === subject ? ' active' : ''}`}
                    onClick={() => setSubject(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Message — autogrow textarea, iOS-friendly */}
            <div className="contact-field">
              <label className="contact-label" htmlFor="contact-message">Message</label>
              <textarea
                id="contact-message"
                className="contact-textarea"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us what you need…"
                rows={6}
                maxLength={6000}
                autoComplete="off"
              />
            </div>

            {error && <div className="contact-error">{error}</div>}

            <button
              type="submit"
              className="contact-submit"
              disabled={!message.trim() || sending}
            >
              {sending ? 'Sending…' : 'Send to ops →'}
            </button>

            {/* Subtle text-links for call/text — no big CTA cards */}
            <div className="contact-altline">
              or{' '}
              <a className="contact-altlink" href={`sms:${OPS_PHONE}`}>text {OPS_PHONE_DISPLAY}</a>
              {' · '}
              <a className="contact-altlink" href={`tel:${OPS_PHONE}`}>call {OPS_HOURS.replace('Daily · ', '')}</a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function SentState({ memberName, onAgain }: { memberName: string | null; onAgain: () => void }) {
  return (
    <div className="contact-sent">
      <div className="contact-sent__check" aria-hidden>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="contact-sent__title">
        Got it{memberName ? `, ${memberName.split(' ')[0]}.` : '.'}
      </h2>
      <p className="contact-sent__body">
        Ops has your note. Expect a reply within minutes during desk hours.
      </p>
      <button type="button" className="contact-altlink" onClick={onAgain} style={{ marginTop: 18 }}>
        Send another →
      </button>
    </div>
  )
}
