import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
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
          fontSize: 340,
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
