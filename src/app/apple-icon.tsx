import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #063847 0%, #0d3340 55%, #00788b 100%)',
          color: '#f3ece0',
          fontSize: 120,
          fontWeight: 600,
          fontStyle: 'italic',
          fontFamily: 'Georgia, serif',
        }}
      >
        T
      </div>
    ),
    { ...size }
  )
}
