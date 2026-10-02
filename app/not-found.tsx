import Link from 'next/link';

export default function NotFound() {
  return <main id="main-content" className="container"><p className="eyebrow">Record not found</p><h1>This disclosure is not available.</h1><p className="loading-note">The requested archive record could not be found at this address.</p><Link className="text-link" href="/">Return to the feed →</Link></main>;
}
