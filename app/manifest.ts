import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIGNALKEEPER — Ownership intelligence',
    short_name: 'SIGNALKEEPER',
    description: 'Historical ownership disclosure research for IDX companies',
    start_url: '/',
    display: 'standalone',
    background_color: '#07090e',
    theme_color: '#0284c7',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
