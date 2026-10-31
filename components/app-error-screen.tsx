"use client";

/**
 * On-brand fallback for a crashed screen.
 * Styles live here because global-error replaces the root layout and its CSS.
 */
const ERROR_CSS = `
.slab-error, .slab-error * { box-sizing: border-box; }
.slab-error {
  margin: 0;
  padding: 4rem 1.5rem max(2rem, env(safe-area-inset-bottom));
  padding-top: max(4rem, env(safe-area-inset-top));
  text-align: center;
  font-family: inherit;
  background: #f4f4f5;
  color: #18181b;
}
.slab-error-fill { min-height: 100dvh; }
.slab-error-brand {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #7C3AED;
}
.slab-error h1 {
  margin: 0.5rem 0 0;
  font-size: 17px;
  line-height: 1.3;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.slab-error p.slab-error-detail {
  max-width: 18rem;
  margin: 0.375rem auto 0;
  font-size: 14px;
  line-height: 1.25rem;
  color: #71717a;
}
.slab-error-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
.slab-error-try, .slab-error-home {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  margin: 0;
  padding: 0 1rem;
  border-radius: 999px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  text-decoration: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}
.slab-error-try {
  border: 0;
  background: #18181b;
  color: #fff;
}
.slab-error-home {
  border: 1px solid #d4d4d8;
  background: transparent;
  color: inherit;
}
body.slab-error-root {
  margin: 0;
  min-height: 100%;
  background: #f4f4f5;
  color: #18181b;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .slab-error, body.slab-error-root { background: #09090b; color: #f4f4f5; }
  .slab-error p.slab-error-detail { color: #a1a1aa; }
  .slab-error-try { background: #f4f4f5; color: #09090b; }
  .slab-error-home { border-color: rgba(255, 255, 255, 0.2); }
}
`;

export function AppErrorScreen({
  onTryAgain,
  fill = false,
}: {
  onTryAgain: () => void;
  /** Fill the viewport when this screen replaces the root layout. */
  fill?: boolean;
}) {
  return (
    <div className={fill ? "slab-error slab-error-fill" : "slab-error"}>
      <style>{ERROR_CSS}</style>
      <p className="slab-error-brand">Slabhold</p>
      <h1>Something went wrong</h1>
      <p className="slab-error-detail">This screen hit a snag. Try again, or go home.</p>
      <div className="slab-error-actions">
        <button type="button" className="slab-error-try" onClick={() => onTryAgain()}>
          Try again
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a crashed screen should load home as a fresh document */}
        <a className="slab-error-home" href="/">
          Go home
        </a>
      </div>
    </div>
  );
}
