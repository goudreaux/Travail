import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Travail',
    short_name: 'Travail',
    description: 'Private aviation + experiences membership',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5ede0',
    theme_color: '#063847',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Padded on a navy field so Android's adaptive/circular mask doesn't crop
      // the mark (the plain icons above are edge-to-edge and would get clipped).
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
