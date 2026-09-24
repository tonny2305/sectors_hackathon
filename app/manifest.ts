import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ownership Materiality Sentinel',
    short_name: 'Sentinel',
    description: 'Autonomous Attention & Materiality Intelligence Layer for IDX Disclosures',
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
