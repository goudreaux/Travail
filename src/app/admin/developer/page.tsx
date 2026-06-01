'use client'
import { useState } from 'react'
import Link from 'next/link'
import stats from '@/lib/code-stats.json'
import { MemberStatsPanel } from './MemberStatsPanel'
import { EnvelopePreviewPanel } from './EnvelopePreviewPanel'
import { BookingSplashPreviewPanel } from './BookingSplashPreviewPanel'
import { TutorialPreviewPanel } from './TutorialPreviewPanel'
import { TutorialEditorPanel } from './TutorialEditorPanel'
import { FeatureMatrix } from './FeatureMatrix'
import { MaintenancePanel } from './MaintenancePanel'

// Collapsible wrapper for every developer tool. Collapsed by default so the
// page opens as a clean index of tools; expand only what you need. The header
// is a thin toggle bar; the tool's own panel renders below when open.
function DevSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '13px 16px', background: 'var(--card)', border: '1px solid var(--hair)',
          borderRadius: open ? '12px 12px 0 0' : 12, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {badge}
          <span aria-hidden style={{ fontSize: 16, color: 'var(--ink-light)', transition: 'transform 0.18s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        </span>
      </button>
      {open && <div style={{ border: '1px solid var(--hair)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 12 }}>{children}</div>}
    </div>
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

        {/* Every tool collapsed by default — expand what you need. */}
        <DevSection title="Maintenance · kill switch"><MaintenancePanel /></DevSection>

        <DevSection title="Feature matrix"><FeatureMatrix /></DevSection>

        <DevSection title="Codebase stats">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            <StatTile label="TypeScript / TSX" value={nf(t.tsLines)} sub={`${t.tsFiles} files`} accent="tropic" />
            <StatTile label="CSS" value={nf(t.cssLines)} sub="globals.css" accent="sun" />
            <StatTile label="DB migrations" value={nf(t.migrations)} sub={`${nf(t.migrationLines)} SQL lines`} accent="moss" />
            <StatTile label="Pages" value={nf(t.pages)} sub="App Router screens" />
            <StatTile label="Components" value={nf(t.components)} sub={`${nf(t.componentLines)} lines`} />
            <StatTile label="API routes" value={nf(t.apiRoutes)} sub={`${nf(t.apiLines)} lines`} />
            <StatTile label="Library modules" value={nf(t.libFiles)} sub={`${nf(t.libLines)} lines`} />
            <StatTile label="Commits / day" value={commitsPerDay} sub="rolling average" />
          </div>
        </DevSection>

        {/* Comparisons */}
        <DevSection title="How we stack up" badge={<span className="mono" style={{ fontSize: 9.5 }}>at {nf(t.totalLines)} lines</span>}>
          <div>
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
        </DevSection>

        {/* Fun stats */}
        <DevSection title="Fun facts">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
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
        </DevSection>

        {/* Recent commits */}
        <DevSection title="Recent commits" badge={<span className="mono" style={{ fontSize: 9.5 }}>{stats.branch}</span>}>
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
        </DevSection>

        <DevSection title="Email envelope preview"><EnvelopePreviewPanel /></DevSection>
        <DevSection title="Booking splash preview"><BookingSplashPreviewPanel /></DevSection>
        <DevSection title="Tutorial preview"><TutorialPreviewPanel /></DevSection>
        <DevSection title="Tutorial editor"><TutorialEditorPanel /></DevSection>
        <DevSection title="Member stats"><MemberStatsPanel /></DevSection>

        <div style={{ marginTop: 24, fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Snapshot {relDate(stats.generatedAt)} · refreshed on every deploy
        </div>

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
