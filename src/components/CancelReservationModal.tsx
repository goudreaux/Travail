'use client'
import { useState, useEffect } from 'react'
import { fmtMoney } from '@/lib/data'

// Cancellation modal with intentional friction. Surfaces the policy
// math up front (refund vs forfeit based on hours-to-departure) and
// makes the destructive action require explicit acknowledgement —
// checkboxes for an outside-window cancel, typed FORFEIT for an
// inside-window forfeit. Members shouldn't be able to cancel
// willy-nilly: the click that loses them money should require thought.

export interface CancelReservationModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void> | void
  submitting: boolean
  error: string | null
  // Trip context (used for headline + countdown).
  tripName: string
  tripDate: string | null
  hoursUntilDeparture: number   // < 0 if trip already departed
  windowHours: number           // policy window — 72 by default
  // Money context.
  amountPaidCents: number       // what the member paid
  // Habitual-cancellation warning. When the member has already
  // cancelled ≥ 3 trips in the rolling 90 days, the modal surfaces a
  // soft "this may put your membership under review" notice. No hard
  // block — ops makes the call from the data.
  recentCancelCount?: number    // count in the last 90 days, defaults to 0
}

export function CancelReservationModal({
  open, onClose, onConfirm, submitting, error,
  tripName, tripDate, hoursUntilDeparture, windowHours, amountPaidCents,
  recentCancelCount = 0,
}: CancelReservationModalProps) {
  const insideWindow = hoursUntilDeparture < windowHours
  const departed = hoursUntilDeparture <= 0

  // Independent confirmations the member has to tick / type before the
  // destructive button enables. Both branches need explicit acks.
  const [ackPoolReturn, setAckPoolReturn] = useState(false)
  const [ackNoRefund, setAckNoRefund] = useState(false)
  const [ackForfeit, setAckForfeit] = useState(false)
  const [forfeitText, setForfeitText] = useState('')
  const [reason, setReason] = useState('')

  // Reset all the friction state whenever the modal opens fresh.
  useEffect(() => {
    if (open) {
      setAckPoolReturn(false)
      setAckNoRefund(false)
      setAckForfeit(false)
      setForfeitText('')
      setReason('')
    }
  }, [open])

  if (!open) return null

  const canConfirm = departed
    ? false  // Trip departed — endpoint refuses anyway
    : insideWindow
      ? (ackNoRefund && ackForfeit && forfeitText.trim().toUpperCase() === 'FORFEIT')
      : ackPoolReturn

  const hoursLabel = (() => {
    if (hoursUntilDeparture <= 0) return 'Already departed'
    if (hoursUntilDeparture < 1) return `${Math.round(hoursUntilDeparture * 60)} minutes from departure`
    if (hoursUntilDeparture < 24) return `${Math.floor(hoursUntilDeparture)}h ${Math.round((hoursUntilDeparture % 1) * 60)}m from departure`
    return `${Math.floor(hoursUntilDeparture / 24)} day${Math.floor(hoursUntilDeparture / 24) === 1 ? '' : 's'}, ${Math.floor(hoursUntilDeparture % 24)}h from departure`
  })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(13,51,64,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 520, background: 'var(--card)',
          borderRadius: 18, overflow: 'hidden', position: 'relative',
          boxShadow: '0 30px 80px rgba(13,51,64,0.35), 0 4px 12px rgba(13,51,64,0.18)',
          maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — tone matches the consequence: signal for forfeit, sun for refund */}
        <div style={{
          padding: '22px 28px 18px',
          background: insideWindow
            ? 'linear-gradient(135deg,#3a1410 0%,#5a201b 100%)'
            : 'linear-gradient(135deg,#042128 0%,#0a3340 100%)',
          color: '#fff',
        }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: insideWindow ? '#f4a72c' : '#00b3c7',
            fontWeight: 700, marginBottom: 8,
          }}>
            {insideWindow ? 'Cancellation · inside policy window' : 'Cancel reservation'}
          </div>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700,
            letterSpacing: '-0.018em', lineHeight: 1.15, marginBottom: 4,
          }}>
            {tripName}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em' }}>
            {tripDate && `${tripDate} · `}{hoursLabel}
          </div>
        </div>

        <div style={{ padding: '20px 28px 22px', overflowY: 'auto' }}>
          {recentCancelCount >= 3 && !departed && (
            <div style={{
              background: 'rgba(244,167,44,0.10)', border: '1px solid rgba(244,167,44,0.30)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--sun-d)', fontWeight: 700, marginBottom: 6 }}>
                Heads up · {recentCancelCount} cancels in 90 days
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
                Repeated cancellations may put your membership under review. Travail is a small network, and consistent commitments matter to the rest of the cabin. If something keeps coming up, reply to a recent email and let Ops know. We'd rather talk than escalate.
              </div>
            </div>
          )}
          {departed ? (
            <div style={{
              background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)',
              borderRadius: 10, padding: '14px 16px', color: 'var(--signal)', fontSize: 14, fontWeight: 600,
            }}>
              This trip has already departed. Reservations can't be cancelled after wheels-up, so contact your concierge if you need to discuss.
            </div>
          ) : insideWindow ? (
            <>
              {/* Forfeit warning — heavy visual */}
              <div style={{
                background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.30)',
                borderRadius: 10, padding: '16px 18px', marginBottom: 18,
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--signal)', fontWeight: 700, marginBottom: 8 }}>
                  No refund, seat forfeited
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 12 }}>
                  You're inside the <strong>{windowHours}-hour</strong> cancellation window. Per the policy you accepted at booking, your seat forfeits and <strong>no refund is issued</strong>.
                </div>
                <div style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  paddingTop: 12, borderTop: '1px solid rgba(217,78,42,0.18)',
                }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-mid)', fontWeight: 600 }}>You forfeit</span>
                  <span style={{ fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 22, color: 'var(--signal)', letterSpacing: '-0.018em' }}>
                    {fmtMoney(amountPaidCents / 100)}
                  </span>
                </div>
              </div>

              {/* Acknowledgements */}
              <label style={{ display: 'flex', gap: 10, padding: '10px 0', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)' }}>
                <input type="checkbox" checked={ackNoRefund} onChange={e => setAckNoRefund(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                <span>I understand I will <strong>not</strong> receive any refund.</span>
              </label>
              <label style={{ display: 'flex', gap: 10, padding: '10px 0', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)' }}>
                <input type="checkbox" checked={ackForfeit} onChange={e => setAckForfeit(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                <span>I understand my <strong>{fmtMoney(amountPaidCents / 100)}</strong> is forfeited and stays with Travail.</span>
              </label>

              {/* Typed confirmation — extra friction */}
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--paper)', borderRadius: 10, border: '1px solid var(--hair)' }}>
                <label style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-mid)', fontWeight: 600, marginBottom: 6 }}>
                  Type <span style={{ color: 'var(--signal)', fontWeight: 700 }}>FORFEIT</span> to confirm
                </label>
                <input
                  type="text"
                  value={forfeitText}
                  onChange={e => setForfeitText(e.target.value)}
                  placeholder="FORFEIT"
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                    fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: '0.12em',
                    border: '1px solid var(--hair)', borderRadius: 8,
                    background: '#fff', color: 'var(--ink)',
                  }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Refund — neutral / positive tone */}
              <div style={{
                background: 'var(--tropic-glow)', border: '1px solid rgba(0,179,199,0.30)',
                borderRadius: 10, padding: '16px 18px', marginBottom: 18,
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--tropic-d)', fontWeight: 700, marginBottom: 8 }}>
                  Full refund · outside policy window
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 12 }}>
                  You're more than <strong>{windowHours} hours</strong> from departure, so cancellation is full-refund. The seat returns to the open pool for another member.
                </div>
                <div style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  paddingTop: 12, borderTop: '1px solid rgba(0,179,199,0.18)',
                }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-mid)', fontWeight: 600 }}>Refunded to your card</span>
                  <span style={{ fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 22, color: 'var(--tropic-d)', letterSpacing: '-0.018em' }}>
                    {fmtMoney(amountPaidCents / 100)}
                  </span>
                </div>
              </div>

              <label style={{ display: 'flex', gap: 10, padding: '10px 0', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)' }}>
                <input type="checkbox" checked={ackPoolReturn} onChange={e => setAckPoolReturn(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                <span>I understand the seat will be released for other members to book.</span>
              </label>
            </>
          )}

          {/* Optional reason field — both branches */}
          {!departed && (
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 6 }}>
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Schedule change, weather, plans shifted…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  fontFamily: 'var(--ui)', fontSize: 13, border: '1px solid var(--hair)',
                  borderRadius: 8, resize: 'vertical', background: 'var(--paper)',
                  color: 'var(--ink)',
                }}
              />
            </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(217,78,42,0.08)', border: '1px solid rgba(217,78,42,0.25)',
              color: 'var(--signal)', borderRadius: 10, padding: '10px 14px',
              fontSize: 13, marginTop: 14,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 28px 20px', borderTop: '1px solid var(--hair)', display: 'flex', gap: 10, background: 'var(--paper)' }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ flex: 1, height: 46, fontSize: 14 }}
            onClick={onClose}
            disabled={submitting}
          >
            Never mind
          </button>
          {!departed && (
            <button
              type="button"
              className="btn-primary"
              style={{
                flex: 1, height: 46, fontSize: 14, justifyContent: 'center',
                background: insideWindow ? 'var(--signal)' : undefined,
                opacity: canConfirm && !submitting ? 1 : 0.5,
                cursor: canConfirm && !submitting ? 'pointer' : 'not-allowed',
              }}
              onClick={() => onConfirm(reason.trim())}
              disabled={!canConfirm || submitting}
            >
              {submitting
                ? <><span className="pending-indicator" style={{ width: 14, height: 14, borderWidth: 2 }} />Processing…</>
                : insideWindow ? `Forfeit ${fmtMoney(amountPaidCents / 100)}` : `Cancel & refund ${fmtMoney(amountPaidCents / 100)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
