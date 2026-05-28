import type { Metadata, Viewport } from 'next'
import './globals.css'
import LaunchAnimation from '@/components/LaunchAnimation'

export const metadata: Metadata = {
  title: 'Travail',
  description: 'Private aviation + experiences membership',
  applicationName: 'Travail',
  appleWebApp: {
    capable: true,
    title: 'Travail',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#063847',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Paint the splash teal as the very first byte of HTML so iOS doesn't
    // flash white between the home-screen tap and React booting. Once the
    // stylesheet loads, body bg takes over for the rest of the app.
    <html lang="en" style={{ background: '#065465' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#065465' }}>
        <LaunchAnimation />
        {children}
      </body>
    </html>
  )
}
