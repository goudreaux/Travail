import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Branded invite card shown when a join link is shared (iMessage, Slack, etc).
// A cream "envelope" invitation — the brand's paper aesthetic — carrying the
// navy Travail wordmark, since the wordmark art is navy ink and needs a light
// ground. Static (no per-code data): every invite link unfurls the same card.
export const alt = "You're invited to Travail"
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Embed the wordmark as a data URL so the image generates without any
  // network/origin dependency at render time.
  const wordmark = await readFile(join(process.cwd(), 'public', 'travail-wordmark.png'))
  const wordmarkSrc = `data:image/png;base64,${wordmark.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fbf6ec',
          // Warm "sun" glow from the upper-right — same conceit as the app's
          // hero cards — over the cream paper.
          backgroundImage:
            'radial-gradient(900px 520px at 100% 0%, rgba(244, 167, 44, 0.20), transparent 60%)',
          padding: 72,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
            width: '100%',
            height: '100%',
            border: '2px solid rgba(13, 51, 64, 0.16)',
            borderRadius: 28,
            backgroundColor: 'rgba(255, 255, 255, 0.40)',
            padding: '64px 80px',
          }}
        >
          <div
            style={{
              fontSize: 24,
              letterSpacing: 8,
              fontWeight: 600,
              color: '#007a8c',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            By Private Invitation
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wordmarkSrc} width={500} height={177} alt="Travail" />

          <div style={{ width: 90, height: 3, backgroundColor: '#00b3c7', borderRadius: 2 }} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 58, fontWeight: 600, color: '#0d3340', lineHeight: 1.1 }}>
              Your seat is waiting.
            </div>
            <div style={{ fontSize: 28, color: '#5b7a86', lineHeight: 1.2 }}>
              Set up your account &mdash; and you&rsquo;re in.
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
