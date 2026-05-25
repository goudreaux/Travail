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
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
