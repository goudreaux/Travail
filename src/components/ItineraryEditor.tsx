'use client'
import { KIND_ICONS } from '@/lib/icons'
import { type ItineraryStep } from '@/lib/itinerary'

// ─── Itinerary editor ───────────────────────────────────────────────────────
//
// Ops authors the day-plan that the member sees on the reserve page.
// Each step has time / label / sub / icon. The "Generate from times"
// button seeds a default plan from the row's existing time fields. After
// generation Ops can edit any field, add a step, or reorder.
//
// Shared between the trips/excursions editor and the proposals review queue.

const ITINERARY_ICONS = ['flight', 'sun', 'fish', 'golf', 'sail', 'snorkel', 'wave', 'surfboard', 'rifle', 'quail', 'hog', 'antlers', 'croc', 'lobster', 'bow']

export function ItineraryEditor({
  steps,
  onChange,
  onGenerateDefaults,
}: {
  steps: ItineraryStep[]
  onChange: (next: ItineraryStep[]) => void
  onGenerateDefaults: () => void
}) {
  function updateStep(i: number, patch: Partial<ItineraryStep>) {
    onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function removeStep(i: number) {
    onChange(steps.filter((_, idx) => idx !== i))
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = steps.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function addStep() {
    onChange([...steps, { time: null, label: '', sub: null, icon: 'flight' }])
  }

  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <label className="field-lab" style={{ margin: 0 }}>
          Day plan <span style={{ fontWeight: 400, color: 'var(--ink-light)' }}>(what the member sees on the reserve page)</span>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-ghost" style={{ height: 28, padding: '0 12px', fontSize: 11.5 }} onClick={onGenerateDefaults}>
            Generate from times
          </button>
          <button type="button" className="btn-ghost" style={{ height: 28, padding: '0 12px', fontSize: 11.5 }} onClick={addStep}>
            + Step
          </button>
        </div>
      </div>

      {steps.length === 0 ? (
        <div style={{ background: 'var(--paper)', border: '1px dashed var(--hair-2)', borderRadius: 10, padding: '16px 18px', fontSize: 12.5, color: 'var(--ink-light)' }}>
          No itinerary yet. Members will see the auto-generated default until you author one. Click <strong>Generate from times</strong> to seed it from the day fields, then customize.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'start' }}>
              {/* Reorder + delete column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" className="btn-ghost" style={{ height: 24, width: 24, padding: 0, fontSize: 12 }} onClick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', textAlign: 'center', fontWeight: 700 }}>{i + 1}</span>
                <button type="button" className="btn-ghost" style={{ height: 24, width: 24, padding: 0, fontSize: 12 }} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="Move down">↓</button>
              </div>

              {/* Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 8 }}>
                <input
                  className="input"
                  value={s.time ?? ''}
                  onChange={e => updateStep(i, { time: e.target.value || null })}
                  placeholder="9:00 AM or TBD"
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, height: 32 }}
                />
                <input
                  className="input"
                  value={s.label ?? ''}
                  onChange={e => updateStep(i, { label: e.target.value })}
                  placeholder="Take off at KTPF"
                  style={{ fontSize: 13, height: 32 }}
                />
                <input
                  className="input"
                  value={s.sub ?? ''}
                  onChange={e => updateStep(i, { sub: e.target.value || null })}
                  placeholder="Sub (optional): operator, location…"
                  style={{ fontSize: 12, height: 32, color: 'var(--ink-mid)' }}
                />

                {/* Icon row — horizontal scrollable strip */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginRight: 4 }}>Icon</span>
                  {ITINERARY_ICONS.map(iconKey => (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => updateStep(i, { icon: iconKey })}
                      className={s.icon === iconKey ? 'icon-pip active' : 'icon-pip'}
                      title={iconKey}
                      style={{
                        width: 28, height: 28, padding: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6,
                        border: s.icon === iconKey ? '1.5px solid var(--tropic)' : '1px solid var(--hair)',
                        background: s.icon === iconKey ? 'var(--tropic-glow)' : '#fff',
                        color: s.icon === iconKey ? 'var(--tropic-d)' : 'var(--ink-mid)',
                        cursor: 'pointer',
                      }}
                    >
                      {KIND_ICONS[iconKey]}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="btn-ghost" onClick={() => removeStep(i)} style={{ height: 28, width: 28, padding: 0, color: 'var(--signal)', fontSize: 14 }} title="Remove step">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
