'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Attention Dashboard' },
    { href: '/alerts', label: 'Material Alerts' },
    { href: '/suppressed', label: 'Explainable Silence' },
    { href: '/runs', label: 'Run History' },
    { href: '/watchlist', label: 'Watchlist' },
  ];

  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(7, 9, 14, 0.8)',
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div className="container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '70px',
      }}>
        {/* Brand */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0284c7 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.2rem',
            color: '#fff',
            boxShadow: '0 0 15px rgba(2, 132, 199, 0.4)',
          }}>
            S
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
              SECTORS <span style={{ color: '#38bdf8' }}>SENTINEL</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              OWNERSHIP MATERIALITY LAYER
            </div>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {links.map(link => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  border: isActive ? '1px solid var(--border-active)' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="badge badge-active" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="pulse-dot" />
            AUTONOMOUS ACTIVE
          </div>
        </div>
      </div>
    </header>
  );
}
