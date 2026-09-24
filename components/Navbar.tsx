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
      <div className="container navbar-container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '70px',
        paddingTop: '12px',
        paddingBottom: '12px',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        {/* Brand */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <img
            src="/icon.png"
            alt="Sectors Sentinel Logo"
            width={38}
            height={38}
            style={{
              borderRadius: '8px',
              boxShadow: '0 0 15px rgba(2, 132, 199, 0.4)',
              display: 'block',
              objectFit: 'contain',
            }}
          />
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
        <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {links.map(link => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: isActive ? '1px solid var(--border-active)' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div className="badge badge-active" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="pulse-dot" />
            AUTONOMOUS ACTIVE
          </div>
        </div>
      </div>
    </header>
  );
}
