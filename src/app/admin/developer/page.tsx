'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import stats from '@/lib/code-stats.json'
import { MemberStatsPanel } from './MemberStatsPanel'
import { EnvelopePreviewPanel } from './EnvelopePreviewPanel'
import { BookingSplashPreviewPanel } from './BookingSplashPreviewPanel'
import { TutorialPreviewPanel } from './TutorialPreviewPanel'
import { TutorialEditorPanel } from './TutorialEditorPanel'
import { FeatureMatrix } from './FeatureMatrix'
import { MaintenancePanel } from './MaintenancePanel'

// Reusable collapsible header — same hit area + chevron rotation pattern
// as the section-panel on the member feed. Tap anywhere on the header
// row to toggle. The badge slot is optional ("at N lines" or counts).
function CollapsibleHead({
  title,
  open,
  onToggle,
  badge,
}: {
  title: React.ReactNode
  open: boolean
  onToggle: () => void
  badge?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="panel-head"
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <h3 style={{ margin: 0 }}>{title}</h3>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {badge}
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            fontSize: 16,
            color: 'var(--ink-light)',
            transition: 'transform 0.18s',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          ▾
        </span>
      </span>
    </button>
  )
}

// Tech-company comparison rows for the "How we stack up" panel. Numbers
// are deliberately approximate / well-known — the point is perspective,
// not a leaderboard. If the year is omitted the figure is "at acquisition
// / well-known snapshot."
const COMPARISONS: { name: string; lines: number; note: string }[] = [
  { name: 'Early Reddit (2006 sale)', lines: 5_000, note: 'Python, sold to Condé Nast' },
  { name: 'WhatsApp first launch', lines: 10_000, note: 'Erlang server + iOS client' },
  { name: 'Instagram at $1B sale', lines: 25_000, note: '13 employees, Python + ObjC' },
  { name: 'Dropbox MVP launch', lines: 30_000, note: 'Python + C++ desktop client' },
  { name: 'Notion v1', lines: 35_000, note: 'Roughly your size, pre Series A' },
  { name: 'Stripe at launch', lines: 50_000, note: 'Ruby + JS, 2010' },
  { name: 'Linear v1', lines: 65_000, note: 'TypeScript + React, ~2019' },
  { name: 'Airbnb pre-IPO scale', lines: 1_700_000, note: 'Decades, hundreds of engineers' },
  { name: 'Linux kernel (today)', lines: 30_000_000, note: 'Different universe, an OS' },
]

function nf(n: number) {
  return n.toLocaleString('en-US')
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relDate(iso: string) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(iso)
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
}

export default function DeveloperDashboard() {
  const t = stats.totals
  const days = daysBetween(stats.firstCommitISO, stats.lastCommit.iso)
  const linesPerDay = Math.round(t.totalLines / days)
  const commitsPerDay = (t.commits / days).toFixed(1)
  // Both heavyweight panels default to closed on mobile (≤ 720px) and
  // open on desktop. Server-render assumes open so the markup is
  // stable; an effect collapses them on mount if the viewport is
  // narrow. Admins can toggle anytime via the header chevron.
  const [stackOpen, setStackOpen] = useState(true)
  const [memberStatsOpen, setMemberStatsOpen] = useState(true)
  useEffect(() => {
    if (window.matchMedia?.('(max-width: 720px)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStackOpen(false)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMemberStatsOpen(false)
    }
  }, [])

  // "If you typed this out" — assumes 60wpm ≈ 300 chars/min, ~40 chars/line.
  const typingMinutes = Math.round((t.totalLines * 40) / 300)
  const typingHours = Math.round(typingMinutes / 60)

  // 80k-word novel ≈ 400 pages. Code averages ~30 chars/line, so ~50 lines per
  // printed page. Loose, fun comparison only.
  const printedPages = Math.round(t.totalLines / 50)
  const novelEquivalents = (printedPages / 400).toFixed(1)

  return (
    <div className="page">
      <div className="page-view" style={{ maxWidth: 1100 }}>
        {/* Hero — the headline number */}
        <div className="panel" style={{ padding: '32px 28px', marginBottom: 24, background: 'var(--night)', color: 'var(--paper)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--tropic)', fontWeight: 600, marginBottom: 14 }}>
            Travail · Build Stats
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <div className="display-i" style={{ fontSize: 'clamp(48px, 9vw, 84px)', lineHeight: 1, color: 'var(--paper)' }}>
              {nf(t.totalLines)}
            </div>
            <div style={{ fontSize: 16, color: 'rgba(251,246,236,0.7)', fontFamily: 'var(--ui)', fontWeight: 500 }}>
              lines of code
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 28, flexWrap: 'wrap', color: 'rgba(251,246,236,0.85)', fontSize: 13, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
            <span>{nf(t.commits)} commits</span>
            <span>·</span>
            <span>{days} days of build</span>
            <span>·</span>
            <span>{linesPerDay.toLocaleString()} lines/day</span>
            <span>·</span>
            <span>last commit {relDate(stats.lastCommit.iso)}</span>
          </div>
        </div>

        {/* Platform kill switch — freezes all transactions. Top of the
            page since it's the most consequential control here. */}
        <MaintenancePanel />

        {/* Investor-facing feature matrix — collapsed by default,
            expand to share with stakeholders. */}
        <FeatureMatrix />

        {/* Grid of stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 28 }}>
          <StatTile label="TypeScript / TSX" value={nf(t.tsLines)} sub={`${t.tsFiles} files`} accent="tropic" />
          <StatTile label="CSS" value={nf(t.cssLines)} sub="globals.css" accent="sun" />
          <StatTile label="DB migrations" value={nf(t.migrations)} sub={`${nf(t.migrationLines)} SQL lines`} accent="moss" />
          <StatTile label="Pages" value={nf(t.pages)} sub="App Router screens" />
          <StatTile label="Components" value={nf(t.components)} sub={`${nf(t.componentLines)} lines`} />
          <StatTile label="API routes" value={nf(t.apiRoutes)} sub={`${nf(t.apiLines)} lines`} />
          <StatTile label="Library modules" value={nf(t.libFiles)} sub={`${nf(t.libLines)} lines`} />
          <StatTile label="Commits / day" value={commitsPerDay} sub="rolling average" />
        </div>

        {/* Comparisons */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <CollapsibleHead
            title="How we stack up"
            open={stackOpen}
            onToggle={() => setStackOpen(o => !o)}
            badge={<span className="mono" style={{ fontSize: 9.5 }}>at {nf(t.totalLines)} lines</span>}
          />
          <div style={{ padding: '4px 0', display: stackOpen ? 'block' : 'none' }}>
            {COMPARISONS.map(c => {
              const ratio = t.totalLines / c.lines
              const ahead = ratio >= 1
              const widthPct = Math.min(100, ahead ? 100 : ratio * 100)
              return (
                <div key={c.name} style={{ padding: '14px 22px', borderBottom: '1px solid var(--hair)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-light)' }}>{c.note}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-mid)' }}>
                      {nf(c.lines)} lines
                    </div>
                  </div>
                  <div style={{ position: 'relative', height: 6, background: 'var(--warm)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${widthPct}%`,
                      background: ahead ? 'var(--tropic)' : 'var(--ink-light)',
                      borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', color: ahead ? 'var(--tropic-d)' : 'var(--ink-light)', marginTop: 4, textTransform: 'uppercase' }}>
                    {ahead
                      ? `You're ${ratio.toFixed(1)}× their size`
                      : `${(ratio * 100).toFixed(1)}% of their size`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Fun stats */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head"><h3>Fun facts</h3></div>
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <Fact
              big={`${typingHours} hours`}
              label="to type out every line at 60 wpm"
            />
            <Fact
              big={nf(printedPages)}
              label="printed pages of code (~50 lines per page)"
            />
            <Fact
              big={`${novelEquivalents}×`}
              label="length of an average novel (400 pages)"
            />
            <Fact
              big={`${days} days`}
              label={`since the first commit on ${fmtDate(stats.firstCommitISO)}`}
            />
          </div>
        </div>

        {/* Recent commits */}
        <div className="panel">
          <div className="panel-head">
            <h3>Recent commits</h3>
            <span className="mono" style={{ fontSize: 9.5 }}>{stats.branch}</span>
          </div>
          <div>
            {stats.recentCommits.map((c, i) => (
              <div
                key={c.hash}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 14,
                  padding: '12px 22px',
                  borderBottom: i < stats.recentCommits.length - 1 ? '1px solid var(--hair)' : 'none',
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: 'var(--tropic-d)', flexShrink: 0, width: 64 }}>
                  {c.hash}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>
                  {c.message}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-light)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {relDate(c.iso)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 24, fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Snapshot {relDate(stats.generatedAt)} · refreshed on every deploy
        </div>

        <EnvelopePreviewPanel />
        <BookingSplashPreviewPanel />
        <TutorialPreviewPanel />
        <TutorialEditorPanel />

        <MemberStatsPanel
          collapsible
          open={memberStatsOpen}
          onToggle={() => setMemberStatsOpen(o => !o)}
        />

        <div style={{ marginTop: 28 }}>
          <Link href="/admin" className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mid)' }}>
            ← Back to admin
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'tropic' | 'sun' | 'moss' }) {
  const accentColor = accent === 'tropic' ? 'var(--tropic-d)'
    : accent === 'sun' ? 'var(--sun-d)'
    : accent === 'moss' ? 'var(--moss)'
    : 'var(--ink)'
  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <div className="mono" style={{ fontSize: 9.5, marginBottom: 8 }}>{label}</div>
      <div className="display-i" style={{ fontSize: 28, color: accentColor, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-light)', marginTop: 6, letterSpacing: '0.06em' }}>{sub}</div>}
    </div>
  )
}

function Fact({ big, label }: { big: string; label: string }) {
  return (
    <div>
      <div className="display-i" style={{ fontSize: 26, color: 'var(--ink)', lineHeight: 1.1 }}>{big}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-mid)', lineHeight: 1.45, marginTop: 4 }}>{label}</div>
    </div>
  )
}
