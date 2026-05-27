'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, fmtHomeBase, memberCode, tierLabel, tierPill, TRIP_TYPES, canonicalInterests } from '@/lib/data'
import { safeError } from '@/lib/pii-scrub'
import PageHero from '@/components/PageHero'
import type { Member, Booking, AnchorSubmission, MemberSensitive } from '@/lib/supabase/types'

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
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: memberData } = await supabase
          .from('members').select('*').eq('user_id', user.id).single()
        if (!memberData) return

        const m = memberData as Member
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
    load()
  }, [])

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
      setMember(prev => prev ? {
        ...prev,
        name,
        bio: bio || null,
        interests: interestArr.length > 0 ? interestArr : null,
        accepts_contact_requests: acceptsContact,
      } : prev)
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
        eyebrow={member.tier === 'administrator' ? tierLabel(member.tier) : `${memberCode(member)} · ${tierLabel(member.tier)}`}
        title="Membership."
        sub="Your account, history, and settings."
        metric={{
          value: memberCode(member).replace('#', ''),
          label: tierLabel(member.tier),
          sub: dp && member.joined_at ? `Since ${dp.mo} ${member.joined_at.slice(0, 4)}` : undefined,
        }}
      />

      <div className="page-view">
        <div className="two-col" style={{ gap: 24 }}>
          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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
                    <label className="field-lab">Interests <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>— pick the trip types you&rsquo;re into</span></label>
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
                          When off, other members can&rsquo;t ask for your email or phone. They&rsquo;ll see a &ldquo;private&rdquo; cue and be told to coordinate through Ops.
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
            {/* Membership details */}
            <div className="panel">
              <div className="panel-head">
                <h3>Membership details</h3>
              </div>
              <div style={{ padding: '6px 0 8px' }}>
                {[
                  { label: 'Tier', value: <span className={`pill ${tierPill(member.tier)}`}>{tierLabel(member.tier)}</span> },
                  { label: 'Member ID', value: <span className="mono" style={{ fontSize: 10 }}>{memberCode(member)}</span> },
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
