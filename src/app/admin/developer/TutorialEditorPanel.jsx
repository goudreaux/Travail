'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BAKED_DEFAULTS, TUTORIAL_ICONS, loadTutorialSteps } from '@/lib/tutorial-steps'
import { FirstLoginTutorial } from '@/components/FirstLoginTutorial'

// Inline editor for the first-login tutorial copy. Lists each step
// with editable eyebrow / title / body inputs, an icon-key dropdown,
// per-step Save + Reset buttons, and a live preview button that
// mounts FirstLoginTutorial with the in-progress copy (stepsOverride)
// so admins can see how their pending edits read before saving.
//
// Steps marked is_locked have their body field disabled — the install
// step body is a platform-aware sentinel that the component swaps for
// iOS / Android / Desktop instructions at render time, and editing it
// would break the swap.

const ICON_KEYS = Object.keys(TUTORIAL_ICONS)

export function TutorialEditorPanel() {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState(BAKED_DEFAULTS)
  const [drafts, setDrafts] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [previewRun, setPreviewRun] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const [toast, setToast] = useState(null)

  const flash = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // Pull current copy from the DB; falls back to baked defaults if
  // migration 055 hasn't been applied yet.
  const load = useCallback(async () => {
    const rows = await loadTutorialSteps(supabase)
    setSteps(rows)
    // Reset all drafts on reload — anything unsaved is gone.
    const fresh = {}
    rows.forEach(r => {
      fresh[r.step_key] = { eyebrow: r.eyebrow, title: r.title, body: r.body, icon_key: r.icon_key }
    })
    setDrafts(fresh)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) load() }, [open, load])

  function setDraft(key, patch) {
    setDrafts(d => ({ ...d, [key]: { ...d[key], ...patch } }))
  }

  async function saveStep(stepKey) {
    const d = drafts[stepKey]
    if (!d) return
    setSavingKey(stepKey)
    try {
      const { error } = await supabase
        .from('tutorial_steps')
        .update({ eyebrow: d.eyebrow, title: d.title, body: d.body, icon_key: d.icon_key, updated_at: new Date().toISOString() })
        .eq('step_key', stepKey)
      if (error) throw error
      flash(`Saved "${stepKey}"`)
      load()
    } catch (e) {
      flash(`Save failed: ${e?.message ?? 'unknown'}`, false)
    } finally {
      setSavingKey(null)
    }
  }

  function resetStep(stepKey) {
    const baked = BAKED_DEFAULTS.find(s => s.step_key === stepKey)
    if (!baked) return
    setDraft(stepKey, { eyebrow: baked.eyebrow, title: baked.title, body: baked.body, icon_key: baked.icon_key })
  }

  function preview() {
    setPreviewRun(r => r + 1)
    setPreviewing(true)
  }

  // Build the override array from current drafts (in DB order) so the
  // preview reflects what's on screen, not what's saved.
  const previewSteps = steps
    .slice()
    .sort((a, b) => a.order_idx - b.order_idx)
    .map(s => ({
      ...s,
      eyebrow: drafts[s.step_key]?.eyebrow ?? s.eyebrow,
      title:   drafts[s.step_key]?.title   ?? s.title,
      body:    drafts[s.step_key]?.body    ?? s.body,
      icon_key: drafts[s.step_key]?.icon_key ?? s.icon_key,
    }))

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="panel-head"
        style={{
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>First-login tutorial · edit copy</h3>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="pill sun" style={{ fontSize: 9.5 }}>CONCIERGE COPY</span>
          <span aria-hidden style={{
            fontSize: 16, color: 'var(--ink-light)',
            transition: 'transform 0.18s',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            display: 'inline-block',
          }}>▾</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: '16px 20px 22px' }}>
          {toast && (
            <div style={{
              position: 'fixed', top: 16, right: 16, zIndex: 200,
              background: toast.ok ? 'var(--moss)' : 'var(--signal)', color: '#fff',
              padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            }}>{toast.msg}</div>
          )}

          <p style={{ fontSize: 13, color: 'var(--ink-light)', lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}>
            Edit the copy of each tutorial slide directly. Each step has its own Save button. The
            install step&apos;s body is locked because it&apos;s a platform-aware placeholder that
            renders iOS / Android / Desktop instructions at runtime, only the eyebrow + title are
            editable on that one.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn-primary" onClick={preview} disabled={previewing}>
              ▶ Preview with current edits
            </button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', alignSelf: 'center', letterSpacing: '0.06em' }}>
              Run #{previewRun}{previewing ? ' · open' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {steps.slice().sort((a, b) => a.order_idx - b.order_idx).map(s => {
              const d = drafts[s.step_key] ?? s
              const dirty = (
                d.eyebrow !== s.eyebrow
                || d.title   !== s.title
                || d.body    !== s.body
                || d.icon_key !== s.icon_key
              )
              const saving = savingKey === s.step_key
              const locked = !!s.is_locked
              return (
                <div key={s.step_key} style={{
                  background: 'var(--paper)', border: `1px solid ${dirty ? 'var(--sun-d)' : 'var(--hair)'}`,
                  borderRadius: 12, padding: '14px 16px', transition: 'border-color 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em',
                      textTransform: 'uppercase', fontWeight: 700, color: 'var(--tropic-d)',
                      background: 'var(--tropic-glow)', padding: '3px 8px', borderRadius: 4,
                    }}>
                      Step {s.order_idx} · {s.step_key}
                    </span>
                    {locked && <span className="pill ink" style={{ fontSize: 9.5 }}>body locked</span>}
                    {dirty && <span className="pill sun" style={{ fontSize: 9.5 }}>unsaved</span>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10, marginBottom: 8 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="field-lab">Eyebrow</label>
                      <input
                        className="input"
                        value={d.eyebrow}
                        onChange={e => setDraft(s.step_key, { eyebrow: e.target.value.toUpperCase() })}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="field-lab">Icon</label>
                      <select
                        className="input"
                        value={d.icon_key}
                        onChange={e => setDraft(s.step_key, { icon_key: e.target.value })}
                      >
                        {ICON_KEYS.map(k => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field" style={{ margin: 0, marginBottom: 8 }}>
                    <label className="field-lab">Title</label>
                    <input
                      className="input"
                      value={d.title}
                      onChange={e => setDraft(s.step_key, { title: e.target.value })}
                    />
                  </div>

                  <div className="field" style={{ margin: 0, marginBottom: 10 }}>
                    <label className="field-lab">Body {locked && <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(locked: platform-aware sentinel)</span>}</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={d.body}
                      onChange={e => setDraft(s.step_key, { body: e.target.value })}
                      disabled={locked}
                      style={locked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      className="btn-ghost"
                      onClick={() => resetStep(s.step_key)}
                      style={{ fontSize: 12 }}
                      disabled={saving}
                    >
                      Reset to default
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => saveStep(s.step_key)}
                      style={{ fontSize: 12 }}
                      disabled={saving || !dirty}
                    >
                      {saving ? 'Saving…' : 'Save step'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {previewing && (
            <FirstLoginTutorial
              key={previewRun}
              memberId="preview"
              previewMode
              stepsOverride={previewSteps}
              onDone={() => setPreviewing(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
