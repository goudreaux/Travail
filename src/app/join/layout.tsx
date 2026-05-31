import type { Metadata } from 'next'

// The /join page is a client component, so its share metadata lives here in a
// server layout. This is what an iMessage / Slack / social unfurl reads when
// ops texts someone their invite link — we want it to read as an invitation,
// not the generic site card. The og:image comes from ./opengraph-image.tsx.
const title = "You're invited to Travail"
const description = "Your seat is waiting. Set up your account and you're in."

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: 'Travail',
    url: '/join',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
