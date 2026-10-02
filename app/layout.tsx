import type { ReactNode } from 'react';
import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata = {
  title: 'SIGNALKEEPER — Ownership intelligence',
  description: 'Historical ownership disclosure research for IDX companies.',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' }, { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' }, { url: '/icon-192.png', type: 'image/png', sizes: '192x192' }, { url: '/icon-512.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><Navbar /><div className="page-content">{children}</div><Footer /></body></html>;
}
