'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();
  const links = [{ href: '/', label: 'Feed' }, { href: '/watchlist', label: 'Watchlist' }];
  return <header className="site-header"><div className="container masthead">
    <Link href="/" className="brand" aria-label="Signalkeeper — ownership intelligence"><span className="brand-mark" aria-hidden="true">s.</span><span><strong>SIGNALKEEPER</strong><small>Ownership intelligence</small></span></Link>
    <nav aria-label="Main navigation">{links.map(link => <Link key={link.href} href={link.href} aria-current={(link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)) ? 'page' : undefined}>{link.label}</Link>)}</nav><span className="market-label">IDX / RESEARCH</span>
  </div></header>;
}
