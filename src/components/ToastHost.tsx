'use client'
import { useState, useEffect } from 'react'

// ─── Types ──────────────────────────────────────────────────

type ToastKind = 'info' | 'success' | 'warn'

type ToastOptions = {
  kind?: ToastKind
  eyebrow?: string
  title: string
  body?: string
  duration?: number
}

type Toast = ToastOptions & { id: string }

// ─── Global emitter ─────────────────────────────────────────

let toastFn: ((opts: ToastOptions) => void) | null = null

export function showToast(opts: ToastOptions) {
  toastFn?.(opts)
}

// ─── Color map by kind ───────────────────────────────────────

const KIND_COLOR: Record<ToastKind, { border: string; icon: string; eyebrowColor: string }> = {
  info:    { border: 'var(--tropic)',  icon: 'var(--tropic)',  eyebrowColor: 'rgba(0,179,199,0.7)' },
  success: { border: 'var(--moss)',    icon: 'var(--moss)',    eyebrowColor: 'rgba(62,140,109,0.7)' },
  warn:    { border: 'var(--signal)',  icon: 'var(--signal)',  eyebrowColor: 'rgba(217,78,42,0.7)' },
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === 'success') {
    return (
      <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 11 9 16 18 6" />
      </svg>
    )
  }
  if (kind === 'warn') {
    return (
      <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="11" y1="7" x2="11" y2="12" />
        <circle cx="11" cy="15.5" r="0.7" fill="currentColor" />
      </svg>
    )
  }
  // info
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="11" y1="10" x2="11" y2="16" />
      <circle cx="11" cy="7" r="0.7" fill="currentColor" />
    </svg>
  )
}

// ─── Individual toast card ───────────────────────────────────

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const kind: ToastKind = toast.kind ?? 'info'
  const palette = KIND_COLOR[kind]

  return (
    <div
      style={{
        background: 'var(--ink)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'stretch',
        pointerEvents: 'all',
        animation: 'toast-in 0.25s ease',
        minWidth: 280,
        maxWidth: 380,
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={onDismiss}
      role="alert"
      aria-live="polite"
    >
      {/* Left accent bar */}
      <div style={{
        width: 3,
        flexShrink: 0,
        background: palette.border,
        borderRadius: '10px 0 0 10px',
      }} />

      {/* Icon */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '14px 0 14px 14px',
        color: palette.icon,
        flexShrink: 0,
      }}>
        <ToastIcon kind={kind} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        padding: '12px 14px',
        minWidth: 0,
      }}>
        {toast.eyebrow && (
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: palette.eyebrowColor,
            marginBottom: 3,
          }}>
            {toast.eyebrow}
          </div>
        )}
        <div style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.95)',
          lineHeight: 1.3,
        }}>
          {toast.title}
        </div>
        {toast.body && (
          <div style={{
            fontSize: 12.5,
            color: 'rgba(255,255,255,0.55)',
            marginTop: 3,
            lineHeight: 1.45,
          }}>
            {toast.body}
          </div>
        )}
      </div>

      {/* Dismiss X */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '12px 12px 0 0',
        flexShrink: 0,
      }}>
        <div style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          transition: 'color 0.12s',
        }}>
          <svg width="10" height="10" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="5" y1="5" x2="17" y2="17" />
            <line x1="17" y1="5" x2="5" y2="17" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ─── Host component ──────────────────────────────────────────

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    toastFn = (opts: ToastOptions) => {
      const id = Math.random().toString(36).slice(2)
      const duration = opts.duration ?? 4200
      const toast: Toast = { ...opts, id }

      setToasts(curr => [...curr, toast])
      setTimeout(() => {
        setToasts(curr => curr.filter(t => t.id !== id))
      }, duration)
    }

    return () => {
      toastFn = null
    }
  }, [])

  function dismiss(id: string) {
    setToasts(curr => curr.filter(t => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
        alignItems: 'flex-end',
      }}
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map(t => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </div>
  )
}
