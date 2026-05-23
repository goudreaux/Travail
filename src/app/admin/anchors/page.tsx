'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AnchorSubmission, Member, Flight, Excursion, SubmissionStatus } from '@/lib/supabase/types'

type AnchorRow = AnchorSubmission & {
  member: Pick<Member, 'name' | 'initials'> | null
}

function genConfCode(): string {
  return 'TV' + Math.random().toString(36).toUpperCase().slice(2, 8)
}

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

type StatusFilter = 'all' | 'pending' | 'published'

// Active anchors only — declined submissions live in History.
const FILTERS: StatusFilter[] = ['all', 'pending', 'published']
const ACTIVE_STATUSES: SubmissionStatus[] = ['pending', 'published']

export default function AnchorsPage() {
  const supabase = createClient()
  const [anchors, setAnchors] = useState<AnchorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [declineModal, setDeclineModal] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('anchor_submissions')
      .select('*, member:members!member_id(name, initials)')
      .in('status', ACTIVE_STATUSES)
      .order('submitted_at', { ascending: false })
    setAnchors((data ?? []) as unknown as AnchorRow[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = anchors.filter(a => filter === 'all' || a.status === filter)

  const counts: Record<StatusFilter, number> = {
    all: anchors.length,
    pending: anchors.filter(a => a.status === 'pending').length,
    published: anchors.filter(a => a.status === 'published').length,
  }

  async function publish(anchor: AnchorRow) {
    setWorking(anchor.id)
    try {
      const payload = anchor.payload as Record<string, unknown>
      let publishedItemId: string | null = null

      if (anchor.kind === 'flight') {
        const { data: flight, error } = await supabase.from('flights').insert({
          anchor_member_id: anchor.member_id,
          origin_code: payload.origin_code as string,
          dest_code: payload.dest_code as string,
          date: payload.date as string,
          depart_time: payload.depart_time as string,
          duration_mins: (payload.duration_mins as number) ?? 0,
          aircraft_id: payload.aircraft_id as string,
          name: payload.name as string,
          pitch: (payload.pitch as string) ?? null,
          visibility: (payload.visibility as 'members' | 'public') ?? 'members',
          seats_total: payload.seats_total as number,
          seats_anchor: (payload.seats_anchor as number) ?? 1,
          price_per_seat: (payload.price_per_seat as number) ?? 0,
          status: 'open',
        }).select().single()
        if (error) throw error
        publishedItemId = flight.id

        const anchorSeats = (payload.seats_anchor as number) ?? 1
        const pricePerSeat = (payload.price_per_seat as number) ?? 0
        await supabase.from('bookings').insert({
          member_id: anchor.member_id,
          item_kind: 'flight',
          item_id: flight.id,
          seats: anchorSeats,
          price_per_seat: pricePerSeat,
          fees: 0,
          total: pricePerSeat * anchorSeats,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: genConfCode(),
          decided_at: new Date().toISOString(),
        })
      } else {
        const { data: excursion, error } = await supabase.from('excursions').insert({
          anchor_member_id: anchor.member_id,
          template_id: (payload.template_id as string) ?? null,
          origin_code: payload.origin_code as string,
          aircraft_id: (payload.aircraft_id as string) ?? null,
          date: payload.date as string,
          start_time: (payload.start_time as string) ?? null,
          depart_time: (payload.depart_time as string) ?? null,
          arrive_time: (payload.arrive_time as string) ?? null,
          return_time: (payload.return_time as string) ?? null,
          stay_type: (payload.stay_type as 'day_trip' | 'overnight' | 'multi_night') ?? 'day_trip',
          name: payload.name as string,
          pitch: (payload.pitch as string) ?? null,
          visibility: (payload.visibility as 'members' | 'public') ?? 'members',
          spots_total: (payload.spots_total as number) ?? 8,
          spots_anchor: (payload.spots_anchor as number) ?? 1,
          status: 'open',
        }).select().single()
        if (error) throw error
        publishedItemId = excursion.id

        const anchorSpots = (payload.spots_anchor as number) ?? 1
        const price = (payload.price_per_pax as number) ?? 0
        await supabase.from('bookings').insert({
          member_id: anchor.member_id,
          item_kind: 'excursion',
          item_id: excursion.id,
          seats: anchorSpots,
          price_per_seat: price,
          fees: 0,
          total: price * anchorSpots,
          payment_method: 'credits',
          status: 'approved',
          confirmation_code: genConfCode(),
          decided_at: new Date().toISOString(),
        })
      }

      await supabase.from('anchor_submissions').update({
        status: 'published',
        decided_at: new Date().toISOString(),
        published_item_id: publishedItemId,
      }).eq('id', anchor.id)

      await supabase.from('notifications').insert({
        member_id: anchor.member_id,
        kind: 'approval',
        title: anchor.kind === 'flight' ? 'Flight Published' : 'Excursion Published',
        body: `Your ${anchor.kind} "${payload.name as string}" has been published and is now open for bookings.`,
        ref: { anchor_id: anchor.id, item_id: publishedItemId, kind: anchor.kind },
      })

      showToast(`${anchor.kind === 'flight' ? 'Flight' : 'Excursion'} published successfully`)
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Failed to publish', 'error')
    } finally { setWorking(null) }
  }

  async function decline(id: string, reason: string) {
    setWorking(id)
    try {
      const anchor = anchors.find(a => a.id === id)
      if (!anchor) return

      const { error } = await supabase.from('anchor_submissions').update({
        status: 'declined',
        decline_reason: reason,
        decided_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error

      await supabase.from('notifications').insert({
        member_id: anchor.member_id,
        kind: 'approval',
        title: 'Anchor Submission Declined',
        body: reason || 'Your anchor submission could not be approved at this time.',
        ref: { anchor_id: id },
      })

      showToast('Submission declined')
      setDeclineModal(null)
      setDeclineReason('')
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Decline failed', 'error')
    } finally { setWorking(null) }
  }

  const statusColor: Record<string, string> = {
    pending: 'sun', published: 'moss', approved: 'moss', declined: 'signal',
  }

  return (
    <div style={{ padding: 32 }}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      {declineModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,56,71,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 16px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', margin: '0 0 16px' }}>Decline Submission</h3>
            <textarea
              className="input"
              style={{ minHeight: 80, width: '100%', marginBottom: 16 }}
              placeholder="Optional reason for member notification…"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setDeclineModal(null); setDeclineReason('') }}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--signal)' }}
                disabled={!!working}
                onClick={() => declineModal && decline(declineModal, declineReason)}
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Anchor Queue</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>
          Active anchor-submitted flights and excursions. Declined submissions live in <Link href="/admin/history" style={{ color: 'var(--tropic-d)' }}>History</Link>.
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12.5,
              fontFamily: 'var(--ui)', fontWeight: filter === f ? 600 : 400,
              border: `1px solid ${filter === f ? 'var(--tropic)' : 'var(--hair-2)'}`,
              background: filter === f ? 'var(--tropic-glow)' : 'transparent',
              color: filter === f ? 'var(--tropic-d)' : 'var(--ink-light)',
              cursor: 'pointer',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {counts[f] > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700 }}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Member</th>
                <th>Kind</th>
                <th>Trip Name</th>
                <th>Route / Date</th>
                <th>Seats</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const p = a.payload as Record<string, unknown>
                const route = a.kind === 'flight'
                  ? `${p.origin_code as string} → ${p.dest_code as string}`
                  : String(p.origin_code ?? '')
                const isExpanded = expanded === a.id

                return (
                  <>
                    <tr
                      key={a.id}
                      style={{ cursor: 'pointer', background: isExpanded ? 'var(--warm)' : undefined }}
                      onClick={() => setExpanded(isExpanded ? null : a.id)}
                    >
                      <td style={{ width: 32, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>
                        {isExpanded ? '▲' : '▶'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sun-glow)', color: 'var(--sun-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {a.member?.initials ?? '?'}
                          </div>
                          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{a.member?.name ?? 'Unknown'}</span>
                        </div>
                      </td>
                      <td><span className={`pill ${a.kind === 'flight' ? 'tropic' : 'sun'}`}>{a.kind}</span></td>
                      <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{p.name as string}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {route}<br />
                        <span style={{ color: 'var(--ink-light)' }}>{p.date as string}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {a.kind === 'flight'
                          ? `${(p.seats_anchor as number) ?? 1} / ${(p.seats_total as number) ?? '?'}`
                          : `${(p.spots_anchor as number) ?? 1} / ${(p.spots_total as number) ?? '?'}`}
                      </td>
                      <td>
                        <span className={`pill ${statusColor[a.status]}`}>{a.status}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                        {new Date(a.submitted_at).toLocaleDateString()}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {a.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn-sun"
                              style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                              disabled={working === a.id}
                              onClick={() => publish(a)}
                            >
                              {working === a.id ? '…' : 'Publish'}
                            </button>
                            <button
                              className="btn-ghost"
                              style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.3)' }}
                              disabled={working === a.id}
                              onClick={() => setDeclineModal(a.id)}
                            >
                              Decline
                            </button>
                          </div>
                        )}
                        {a.status === 'published' && a.published_item_id && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-light)', letterSpacing: '0.08em' }}>
                            {a.published_item_id.slice(0, 8)}…
                          </span>
                        )}
                        {a.status === 'declined' && a.decline_reason && (
                          <span style={{ fontSize: 11.5, color: 'var(--ink-light)', fontStyle: 'italic', maxWidth: 140, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.decline_reason}>
                            {a.decline_reason}
                          </span>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${a.id}-detail`} style={{ background: 'rgba(0,179,199,0.03)' }}>
                        <td colSpan={9} style={{ padding: '0 16px 16px 48px' }}>
                          <div style={{ background: 'var(--warm)', border: '1px solid var(--hair)', borderRadius: 10, padding: 16, marginTop: 4 }}>
                            <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', letterSpacing: '0.12em', color: 'var(--ink-light)', marginBottom: 12, textTransform: 'uppercase' }}>
                              Full Payload — Submission {a.id.slice(0, 8)}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 24px' }}>
                              {Object.entries(p).map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</span>
                                  <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: v !== null && v !== '' ? 500 : 400, fontStyle: v === null || v === '' ? 'italic' : 'normal' }}>
                                    {v === null || v === '' ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {a.decided_at && (
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--hair)', fontSize: 11.5, color: 'var(--ink-light)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
                                Decided: {new Date(a.decided_at).toLocaleString()}
                                {a.decline_reason && (
                                  <span style={{ marginLeft: 16, fontStyle: 'italic', color: 'var(--signal)' }}>
                                    "{a.decline_reason}"
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>
              No {filter === 'all' ? '' : filter} anchor submissions.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
