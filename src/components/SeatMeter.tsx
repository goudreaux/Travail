// Shared seat/spot availability meter — dots plus an "open/total" label.
export function SeatMeter({ total, available, accent, unit }: { total: number; available: number; accent: string; unit: string }) {
  const open = Math.max(0, available)
  const occupied = Math.max(0, total - open)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => {
          const taken = i < occupied
          return (
            <span
              key={i}
              title={taken ? 'Taken' : 'Open'}
              style={{
                width: 12, height: 12, borderRadius: '50%', boxSizing: 'border-box',
                background: taken ? accent : 'transparent',
                border: taken ? `1px solid ${accent}` : '1px solid var(--ink-mid)',
              }}
            />
          )
        })}
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-soft)', letterSpacing: '0.04em' }}>
        {open}/{total} {unit}
      </span>
    </div>
  )
}
