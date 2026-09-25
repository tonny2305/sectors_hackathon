'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();
  const links = [
    { href: '/', label: 'Attention desk' }, { href: '/alerts', label: 'Priority alerts' },
    { href: '/suppressed', label: 'Attention Log' }, { href: '/runs', label: 'Run logbook' },
    { href: '/watchlist', label: 'Watchlist' },
  ];
  return <header className="site-header"><div className="container masthead">
    <Link href="/" className="brand" aria-label="Sentinel — attention desk"><span className="brand-mark" aria-hidden="true">s.</span><span><strong>SENTINEL</strong><small>Ownership materiality</small></span></Link>
    <nav aria-label="Main navigation">{links.map(link => {
      const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
      return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}>{link.label}</Link>;
    })}</nav><span className="market-label">IDX / RESEARCH DESK</span>
  </div></header>;
}
