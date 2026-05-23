'use client'
import PageHero from '@/components/PageHero'
import { OPS_PHONE, OPS_PHONE_DISPLAY, OPS_EMAIL, OPS_HOURS } from '@/lib/contact'

function ContactCard({
  href, accent, label, value, sub, icon,
}: {
  href: string; accent: string; label: string; value: string; sub: string; icon: React.ReactNode
}) {
  return (
    <a
      href={href}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14,
        padding: '20px 22px', textDecoration: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = accent; el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)'; el.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = ''; el.style.boxShadow = ''; el.style.transform = '' }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: accent, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: 4 }}>{label}</div>
        <div className="display-i" style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-light)', marginTop: 4 }}>{sub}</div>
      </div>
      <span style={{ flexShrink: 0, color: accent, fontSize: 13, fontWeight: 600 }}>→</span>
    </a>
  )
}

const sms = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h14v10H9l-4 3v-3H4z" /></svg>
)
const call = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3.5c.5 2 .5 3 1.5 4-.5 1-1.5 2-2 2.5 1 2 2.5 3.5 4.5 4.5.5-.5 1.5-1.5 2.5-2 1 1 2 1 4 1.5v3c0 .8-.7 1.5-1.5 1.4C9.5 17.5 4.5 12.5 3.6 5 3.5 4.2 4.2 3.5 5 3.5z" /></svg>
)
const mail = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="16" height="12" rx="1.5" /><path d="M3 6l8 6 8-6" /></svg>
)

export default function ContactPage() {
  return (
    <div className="page">
      <PageHero
        eyebrow="Concierge"
        title="Contact ops."
        sub="Save our number and reach us any time — text, call, or email. A member of the team will take care of it."
      />
      <div className="page-view" style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ContactCard
            href={`sms:${OPS_PHONE}`}
            accent="var(--tropic-d)"
            label="Text us"
            value={OPS_PHONE_DISPLAY}
            sub="Fastest way to reach the team."
            icon={sms}
          />
          <ContactCard
            href={`tel:${OPS_PHONE}`}
            accent="var(--sun-d)"
            label="Call us"
            value={OPS_PHONE_DISPLAY}
            sub={OPS_HOURS}
            icon={call}
          />
          <ContactCard
            href={`mailto:${OPS_EMAIL}`}
            accent="var(--moss)"
            label="Email us"
            value={OPS_EMAIL}
            sub="For anything that isn't time-sensitive."
            icon={mail}
          />
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-light)', marginTop: 20, lineHeight: 1.6 }}>
          For booking changes or cancellations, text us your confirmation code and we&rsquo;ll handle the rest.
        </p>
      </div>
    </div>
  )
}
