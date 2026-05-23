'use client'
import { useState } from 'react'

const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MINUTES = ['00','15','30','45']

// Hour / minute / AM-PM stepper used on the anchor builders.
export default function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const parse = (v: string) => {
    const match = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
    return match ? { h: match[1], m: match[2], meridiem: match[3] as 'AM' | 'PM' } : { h: '9', m: '00', meridiem: 'AM' as const }
  }
  const parsed = parse(value)
  const [h, setH] = useState(parsed.h)
  const [m, setM] = useState(parsed.m)
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(parsed.meridiem)

  function emit(nh: string, nm: string, nmer: 'AM' | 'PM') {
    onChange(`${nh}:${nm} ${nmer}`)
  }

  const sel: React.CSSProperties = {
    height: 38,
    border: '1px solid var(--hair-2)',
    borderRadius: 8,
    background: 'var(--card)',
    color: 'var(--ink)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    textAlign: 'center',
    padding: '0 8px',
  }

  return (
    <div className="field">
      <label className="field-lab">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select style={{ ...sel, width: 58 }} value={h} onChange={e => { setH(e.target.value); emit(e.target.value, m, meridiem) }}>
          {HOURS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span style={{ color: 'var(--ink-faint)', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>:</span>
        <select style={{ ...sel, width: 62 }} value={m} onChange={e => { setM(e.target.value); emit(h, e.target.value, meridiem) }}>
          {MINUTES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--hair-2)', borderRadius: 8, overflow: 'hidden', height: 38 }}>
          {(['AM', 'PM'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => { setMeridiem(p); emit(h, m, p) }}
              style={{
                width: 42, height: '100%', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                background: meridiem === p ? 'var(--tropic)' : 'transparent',
                color: meridiem === p ? '#fff' : 'var(--ink-light)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
