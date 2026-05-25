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
    statusBarStyle: 'black-translucent',
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <LaunchAnimation />
        {children}
      </body>
    </html>
  )
}
