'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMember } from '@/lib/member-context'
import { fmtDate, fmtHomeBase, tierLabel, tierPill, TRIP_TYPES, canonicalInterests } from '@/lib/data'
import { safeError } from '@/lib/pii-scrub'
import PageHero from '@/components/PageHero'
import ThemePicker from '@/components/ThemePicker'
import PrivacyToggle from '@/components/PrivacyToggle'
import type { Member, Booking, AnchorSubmission, MemberSensitive } from '@/lib/supabase/types'
import { type Referral, REFERRAL_STATUS_LABEL, REFERRAL_STATUS_PILL } from '@/lib/referrals'

function timeAgo(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(ms / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export default function MembershipPage() {
  // The page keeps a local, editable copy of the member for the profile form;
  // it's seeded from the shared context (no per-page identity fetch) and any
  // save is pushed back into the context so the sidebar/topbar update too.
  const { member: ctxMember, setMember: setCtxMember } = useMember()
  const [member, setMember] = useState<Member | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [submissions, setSubmissions] = useState<AnchorSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const [sensitive, setSensitive] = useState<MemberSensitive | null>(null)
  const [tripDates, setTripDates] = useState<Record<string, string>>({})

  // Editable fields
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [acceptsContact, setAcceptsContact] = useState(true)

  const toggleInterest = (t: string) =>
    setInterests(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))

  useEffect(() => {
    if (!ctxMember) return
    async function load(m: Member) {
      try {
        setMember(m)
        setName(m.name)
        setBio(m.bio ?? '')
        // Pre-select canonical trip types from whatever's stored (older free-text
        // interests like "deep sea fishing" still light up the matching type).
        setInterests(canonicalInterests(m.interests))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAcceptsContact(((m as any).accepts_contact_requests ?? true) === true)

        const [{ data: bookingData }, { data: submissionData }, { data: sensitiveData }] = await Promise.all([
          supabase.from('bookings').select('*').eq('member_id', m.id).order('submitted_at', { ascending: false }),
          supabase.from('anchor_submissions').select('*').eq('member_id', m.id).order('submitted_at', { ascending: false }),
          supabase.from('member_sensitive').select('*').eq('member_id', m.id).maybeSingle(),
        ])

        setBookings((bookingData as Booking[] | null) ?? [])
        setSubmissions((submissionData as AnchorSubmission[] | null) ?? [])
        setSensitive(sensitiveData as MemberSensitive | null)

        // Trip dates per booking (to tell taken vs upcoming)
        const bks = (bookingData as Booking[] | null) ?? []
        const flightIds = bks.filter(b => b.item_kind === 'flight').map(b => b.item_id)
        const excIds = bks.filter(b => b.item_kind === 'excursion').map(b => b.item_id)
        const [flRes, exRes] = await Promise.all([
          flightIds.length ? supabase.from('flights').select('id, date').in('id', flightIds) : Promise.resolve({ data: [] }),
          excIds.length ? supabase.from('excursions').select('id, date').in('id', excIds) : Promise.resolve({ data: [] }),
        ])
        const dates: Record<string, string> = {}
        for (const f of (flRes.data ?? []) as { id: string; date: string }[]) dates[f.id] = f.date
        for (const e of (exRes.data ?? []) as { id: string; date: string }[]) dates[e.id] = e.date
        setTripDates(dates)
      } catch (e) {
        safeError('Membership load failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load(ctxMember)
  }, [ctxMember]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!member) return
    setSaving(true)
    setError('')

    const interestArr = interests

    const { error: updateError } = await supabase
      .from('members')
      .update({
        name,
        bio: bio || null,
        interests: interestArr.length > 0 ? interestArr : null,
        accepts_contact_requests: acceptsContact,
      } as never)
      .eq('id', member.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
    } else {
      const patch = {
        name,
        bio: bio || null,
        interests: interestArr.length > 0 ? interestArr : null,
        accepts_contact_requests: acceptsContact,
      }
      setMember(prev => prev ? { ...prev, ...patch } : prev)
      // Keep the shared context in sync so the sidebar/topbar update too.
      setCtxMember(prev => prev ? { ...prev, ...patch } : prev)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !member) return

    setUploadingAvatar(true)
    setError('')

    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${member.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('member-assets')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('member-assets')
        .getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('members')
        .update({ avatar_url: publicUrl } as never)
        .eq('id', member.id)

      if (updateError) throw updateError

      setMember(prev => prev ? { ...prev, avatar_url: publicUrl } : prev)
      setCtxMember(prev => prev ? { ...prev, avatar_url: publicUrl } : prev)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-view" style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
          <div className="empty">
            <div className="pending-indicator" />
            <p>Loading membership…</p>
          </div>
        </div>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="page">
        <div className="page-view">
          <div className="empty">
            <h3>Unable to load membership.</h3>
          </div>
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  // Taken = confirmed and the trip date has passed.
  const tripsTaken = bookings.filter(b => b.status === 'approved' && tripDates[b.item_id] && tripDates[b.item_id] < today)
  // Pending = booked-but-not-yet-flown (confirmed, upcoming) + awaiting ops in the queue.
  const tripsPending = bookings.filter(b =>
    b.status === 'pending' ||
    (b.status === 'approved' && (!tripDates[b.item_id] || tripDates[b.item_id] >= today))
  )
  const approvedCount = bookings.filter(b => b.status === 'approved').length
  const queueCount = bookings.filter(b => b.status === 'pending').length

  const dp = member.joined_at ? fmtDate(member.joined_at.split('T')[0]) : null

  return (
    <div className="page">
      <PageHero
        accent="sun"
        eyebrow={tierLabel(member.tier)}
        title="Membership"
        sub="Your account, history, and settings."
        metric={{
          value: member.initials || member.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase(),
          label: tierLabel(member.tier),
          sub: dp && member.joined_at ? `Since ${dp.mo} ${member.joined_at.slice(0, 4)}` : undefined,
        }}
      />

      <div className="page-view">
        <div className="two-col" style={{ gap: 24 }}>
          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <SubscriptionPanel member={member} />

            <ReferFriendPanel memberId={member.id} />

            {/* Profile card */}
            <div className="panel">
              <div className="panel-head">
                <h3>Profile</h3>
                {saved && (
                  <span className="pill moss">Saved</span>
                )}
              </div>
              <div style={{ padding: '24px 24px' }}>
                {/* Avatar */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.name}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          display: 'block',
                          border: '2px solid var(--hair)',
                        }}
                      />
                    ) : (
                      <div style={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        background: 'var(--night)',
                        color: 'var(--tropic)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--mono)',
                        fontSize: 22,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        border: '2px solid rgba(0,179,199,0.2)',
                      }}>
                        {member.initials}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleAvatarUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'var(--tropic)',
                        border: '2px solid var(--card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#fff',
                        opacity: uploadingAvatar ? 0.7 : 1,
                      }}
                    >
                      {uploadingAvatar ? (
                        <span className="pending-indicator" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M12 5H9a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" />
                          <path d="M19 3l-8 8" />
                          <path d="M15 3h4v4" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-light)', marginBottom: 4 }}>
                      Upload a profile photo (JPG or PNG)
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className={`pill ${tierPill(member.tier)}`}>
                        {tierLabel(member.tier)}
                      </span>
                      {member.kyc_verified && (
                        <span className="pill moss">Verified</span>
                      )}
                      {fmtHomeBase(member.home_base_code) && (
                        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mid)', alignSelf: 'center' }}>
                          Base: {fmtHomeBase(member.home_base_code)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Editable fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="field">
                    <label className="field-lab">Display name</label>
                    <input
                      type="text"
                      className="input"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      maxLength={80}
                    />
                  </div>

                  <div className="field">
                    <label className="field-lab">Bio</label>
                    <textarea
                      className="input"
                      value={bio}
                      onChange={e => setBio(e.target.value)}
                      placeholder="A few words about yourself…"
                      rows={3}
                      maxLength={500}
                    />
                  </div>

                  <div className="field">
                    <label className="field-lab">Interests <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>(pick the trip types you&rsquo;re into)</span></label>
                    <div className="chips" style={{ flexWrap: 'wrap' }}>
                      {TRIP_TYPES.map(t => (
                        <button
                          key={t}
                          type="button"
                          className={`chip${interests.includes(t) ? ' active' : ''}`}
                          onClick={() => toggleInterest(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field">
                    <label className="field-lab">Privacy</label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={acceptsContact}
                        onChange={e => setAcceptsContact(e.target.checked)}
                        style={{ marginTop: 3, accentColor: 'var(--tropic)' }}
                      />
                      <span style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                        Accept contact info requests
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-light)', marginTop: 2 }}>
                          When off, other members can&rsquo;t ask for your email or phone. They&rsquo;ll see a &ldquo;private&rdquo; cue and be told to coordinate through the Concierge Team.
                        </span>
                      </span>
                    </label>
                  </div>

                  {error && (
                    <div style={{
                      background: 'rgba(217,78,42,0.08)',
                      border: '1px solid rgba(217,78,42,0.2)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 13,
                      color: 'var(--signal)',
                    }}>
                      {error}
                    </div>
                  )}

                  <button
                    className="btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {saving ? (
                      <>
                        <span className="pending-indicator" style={{ width: 12, height: 12, borderWidth: 2 }} />
                        Saving…
                      </>
                    ) : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>

            {/* Trip history */}
            <div className="panel">
              <div className="panel-head">
                <h3>Trip history</h3>
                <span className="mono" style={{ fontSize: 9.5 }}>
                  {approvedCount} confirmed
                  {queueCount > 0 ? ` · ${queueCount} in review` : ''}
                </span>
              </div>
              {bookings.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>
                    No trips booked yet.
                  </p>
                </div>
              ) : (
                <div>
                  {bookings.slice(0, 10).map((b, i) => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 20px',
                        borderBottom: i < Math.min(bookings.length, 10) - 1 ? '1px solid var(--hair)' : 'none',
                      }}
                    >
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: b.item_kind === 'flight' ? 'var(--tropic-glow)' : 'var(--sun-glow)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: b.item_kind === 'flight' ? 'var(--tropic-d)' : 'var(--sun-d)',
                      }}>
                        <svg width="15" height="15" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          {b.item_kind === 'flight'
                            ? <path d="M3 13l7-1 3-7h2l-1 7 5-1 1 1.5-5 3-1 4-2 .5-1-3.5-3 0-1 .5z" />
                            : <><circle cx="11" cy="11" r="8"/><line x1="11" y1="3" x2="11" y2="8"/><line x1="11" y1="14" x2="11" y2="19"/></>
                          }
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                          {b.item_kind === 'flight' ? 'Flight booking' : 'Excursion booking'}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-light)' }}>
                          {b.seats} seat{b.seats !== 1 ? 's' : ''} · ${b.total.toLocaleString()} total
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className={`pill${
                          b.status === 'approved' ? ' moss' :
                          b.status === 'pending' ? ' sun' :
                          b.status === 'declined' ? ' signal' : ''
                        }`} style={{ fontSize: 9 }}>
                          {b.status}
                        </span>
                        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
                          {timeAgo(b.submitted_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="rail">
            {/* Display theme */}
            <ThemePicker />

            {/* Privacy mode */}
            <PrivacyToggle
              memberId={member.id}
              value={member.private_mode ?? false}
              onChange={(v) => {
                const next = { ...member, private_mode: v }
                setMember(next)
                setCtxMember(next)
              }}
            />

            {/* Membership details */}
            <div className="panel">
              <div className="panel-head">
                <h3>Membership details</h3>
              </div>
              <div style={{ padding: '6px 0 8px' }}>
                {[
                  { label: 'Tier', value: <span className={`pill ${tierPill(member.tier)}`}>{tierLabel(member.tier)}</span> },
                  { label: 'Joined', value: dp ? `${dp.mo} ${dp.day}, ${new Date(member.joined_at).getFullYear()}` : '—' },
                  { label: 'KYC status', value: member.kyc_verified ? <span className="pill moss">Verified</span> : <span className="pill signal">Pending</span> },
                  { label: 'Card on file', value: member.card_last4 ? `••••  ••••  ••••  ${member.card_last4}` : <span style={{ color: 'var(--ink-faint)' }}>None on file</span> },
                  ...(fmtHomeBase(member.home_base_code) ? [{ label: 'Home base', value: fmtHomeBase(member.home_base_code) }] : []),
                  ...(sensitive?.date_of_birth ? [{ label: 'Date of birth', value: new Date(sensitive.date_of_birth + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }] : []),
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 20px',
                      borderBottom: '1px solid var(--hair)',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10 }}>{label}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}>
              {[
                { label: 'Trips taken', val: tripsTaken.length },
                { label: 'Trips pending', val: tripsPending.length },
                { label: 'Anchors filed', val: submissions.length },
              ].map(({ label, val }) => (
                <div key={label} className="stat">
                  <div className="val">{val}</div>
                  <div className="label">{label}</div>
                </div>
              ))}
            </div>

            {/* Anchor submissions */}
            {submissions.length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h3>Anchor submissions</h3>
                </div>
                <div>
                  {submissions.slice(0, 5).map((s, i) => {
                    const payload = s.payload as Record<string, unknown>
                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: '12px 18px',
                          borderBottom: i < Math.min(submissions.length, 5) - 1 ? '1px solid var(--hair)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                            {typeof payload?.name === 'string' ? payload.name : `${s.kind} anchor`}
                          </div>
                          <div className="mono" style={{ fontSize: 9.5 }}>
                            {timeAgo(s.submitted_at)}
                          </div>
                        </div>
                        <span className={`pill${
                          s.status === 'published' ? ' tropic' :
                          s.status === 'approved' ? ' moss' :
                          s.status === 'declined' ? ' signal' : ' sun'
                        }`} style={{ fontSize: 9 }}>
                          {s.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Subscription panel ────────────────────────────────────────────────────
// Shows status, renewal date, founder badge, and the manage-card / cancel
// guidance. "Manage card" pops the Stripe Customer Portal; cancel is by
// phone only (policy decision — high friction so members don't ghost the
// subscription without a conversation with ops).

function SubscriptionPanel({ member }: { member: Member }) {
  const status = (member as Member & { subscription_status?: string | null }).subscription_status ?? null
  const periodEnd = (member as Member & { current_period_end?: string | null }).current_period_end ?? null
  const priceId = (member as Member & { subscription_price_id?: string | null }).subscription_price_id ?? null
  const isFounding = !!(member as Member & { is_founding_member?: boolean }).is_founding_member

  // Mark members whose card already failed renewal — bookings paused.
  const isPastDue = status === 'past_due' || status === 'unpaid'
  const isCancelled = status === 'canceled' || status === 'cancelled' || status === 'incomplete_expired'
  // A paid, current billing period means they're active even if our cached
  // Stripe status lags at 'incomplete' (webhook sync delay) — Stripe itself
  // shows the subscription active, so don't leave them on "Setting up".
  const hasCurrentPeriod = !!periodEnd && new Date(periodEnd).getTime() > Date.now()
  const isActive = status === 'active' || status === 'trialing' || (status === 'incomplete' && hasCurrentPeriod)

  const [busy, setBusy] = useState(false)

  async function openPortal() {
    setBusy(true)
    try {
      const res = await fetch('/api/subscribe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setBusy(false)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Membership</h3>
        {isFounding && <span className="pill sun">Founding</span>}
      </div>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 4 }}>
              Status
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
              {isActive ? 'Active' : isPastDue ? 'Card declined' : isCancelled ? 'Ended' : status === 'incomplete' ? 'Setting up' : 'Inactive'}
            </div>
          </div>
          {periodEnd && isActive && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 4 }}>
                Next renewal
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                {new Date(periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          )}
        </div>

        {isFounding && (
          <div style={{ background: 'rgba(244,167,44,0.10)', border: '1px solid rgba(244,167,44,0.30)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 14 }}>
            <strong style={{ color: 'var(--ink)', fontWeight: 700 }}>$200/month founding rate</strong>, locked for as long as your membership stays active.
          </div>
        )}

        {isPastDue && (
          <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--signal)', lineHeight: 1.5, marginBottom: 14 }}>
            Your last renewal failed. Bookings are paused until the card clears. Update your card below, the Concierge Team will be in touch shortly either way.
          </div>
        )}

        {priceId && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.06em', marginBottom: 14 }}>
            Price: {priceId}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(isActive || isPastDue || status === 'incomplete') && (
            <button
              onClick={openPortal}
              disabled={busy}
              style={{
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--ui)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 16px', borderRadius: 9, cursor: busy ? 'default' : 'pointer',
                color: '#fff', border: 'none',
                background: 'var(--signal)',
              }}
            >
              {busy ? 'Opening…' : 'Manage card →'}
            </button>
          )}
          {!status || status === 'none' || isCancelled ? (
            <a href="/onboarding/subscribe" className="btn-primary" style={{ fontSize: 13 }}>
              Start membership
            </a>
          ) : null}
        </div>

        {isActive && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--hair)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 6 }}>
              To cancel
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              Call the Concierge Team at <a href="tel:+14085073523" style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>(408) 507-3523</a>. We&apos;ll process it on the call. Your access continues through the end of the current billing period, no partial refund.
              {isFounding && <> Re-subscribing later will be at the then-current public rate, not the founding rate.</>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Refer a friend panel ──────────────────────────────────────────────────
// Member submits prospects they think would be a good fit. Ops reviews
// each one. Pending submissions can be withdrawn; everything past that
// is read-only for the member (decisions belong to ops).

function ReferFriendPanel({ memberId }: { memberId: string }) {
  const supabase = createClient()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [why, setWhy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('referrals').select('*')
        .eq('referrer_id', memberId)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setReferrals((data ?? []) as Referral[])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('referrals').select('*')
      .eq('referrer_id', memberId)
      .order('created_at', { ascending: false })
    setReferrals((data ?? []) as Referral[])
  }

  function resetForm() {
    setFirst(''); setLast(''); setEmail(''); setPhone(''); setWhy(''); setError(null)
  }

  async function submit() {
    setError(null)
    if (!first.trim() || !last.trim()) { setError('First and last name are required.'); return }
    const e = email.trim()
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setError('Please enter a valid email address.'); return }
    setSubmitting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any).from('referrals').insert({
        referrer_id: memberId,
        first_name: first.trim(),
        last_name: last.trim(),
        email: e,
        phone: phone.trim() || null,
        why: why.trim().slice(0, 2000) || null,
        status: 'pending',
      })
      if (insErr) throw insErr
      // Best-effort ops + self ack. The webhook ships the email; we just
      // drop the in-app notification on the member's own row so they see
      // their submission acknowledged when they hit /notifications.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notifications').insert({
          member_id: memberId,
          kind: 'system',
          title: 'Referral submitted',
          body: `You introduced ${first.trim()} ${last.trim()} to Travail Concierge. We'll be in touch shortly with next steps.`,
        })
      } catch { /* non-fatal */ }
      setShowForm(false); resetForm()
      setToast('Sent to the Concierge Team for review.')
      setTimeout(() => setToast(null), 3500)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  async function withdraw(r: Referral) {
    if (!confirm(`Withdraw your referral for ${r.first_name} ${r.last_name}? You can submit a new one later.`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase as any)
      .from('referrals').update({ status: 'withdrawn' }).eq('id', r.id)
    if (upErr) { setToast(upErr.message); return }
    reload()
  }

  const pending = referrals.filter(r => r.status === 'pending').length

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Refer a friend</h3>
        {pending > 0 && <span className="pill sun">{pending} pending</span>}
      </div>
      <div style={{ padding: '20px 24px' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 14px' }}>
          Know someone who&apos;d be a good Travail member? Send their info to the Concierge Team and we&apos;ll take it from there.
        </p>

        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)} style={{ fontSize: 13 }}>
            Refer someone →
          </button>
        )}

        {showForm && (
          <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-lab">First name</label>
                <input className="input" value={first} onChange={e => setFirst(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-lab">Last name</label>
                <input className="input" value={last} onChange={e => setLast(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="field-lab">Email</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="field-lab">Phone <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span></label>
                <input className="input" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="field-lab">Why they&apos;d be a fit <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span></label>
                <textarea className="input" rows={3} value={why} onChange={e => setWhy(e.target.value)} placeholder="A line or two about who they are and what draws them to this kind of network." />
              </div>
            </div>
            {error && (
              <div style={{ background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: 'var(--signal)', marginTop: 10 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn-primary" disabled={submitting} onClick={submit} style={{ fontSize: 13 }}>
                {submitting ? 'Sending…' : 'Send to the Concierge Team'}
              </button>
              <button className="btn-ghost" onClick={() => { setShowForm(false); resetForm() }} style={{ fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        )}

        {toast && (
          <div style={{ background: 'rgba(62,140,109,0.10)', border: '1px solid rgba(62,140,109,0.30)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: 'var(--moss)', marginBottom: 12 }}>
            {toast}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--ink-light)', padding: '12px 0' }}>Loading…</div>
        ) : referrals.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 8 }}>
              Your referrals
            </div>
            <div style={{ border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
              {referrals.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--hair)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{r.first_name} {r.last_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>{r.email}</div>
                  </div>
                  <span className={`pill ${REFERRAL_STATUS_PILL[r.status]}`} style={{ fontSize: 9.5 }}>
                    {REFERRAL_STATUS_LABEL[r.status]}
                  </span>
                  {r.status === 'pending' && (
                    <button onClick={() => withdraw(r)} style={{ background: 'transparent', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ui)' }}>
                      Withdraw
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
