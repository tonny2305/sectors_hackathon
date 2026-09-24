import type { ReactNode } from 'react';
import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata = {
  title: 'Ownership Materiality Sentinel — Track 2 Automation',
  description: 'Autonomous Attention & Materiality Intelligence Layer for IDX Ownership Filings',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <div style={{ flex: 1, padding: '32px 0 64px' }}>
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
