'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="container"><p className="eyebrow">Record unavailable</p><h1>The record could not be loaded.</h1><p className="loading-note" role="alert">Please try again.</p><button className="btn btn-primary" onClick={() => reset()}>Try again</button></main>;
}
