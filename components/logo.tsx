export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" className="fill-zinc-950 dark:fill-zinc-100" />
      <rect x="9.25" y="4.25" width="13.5" height="23.5" rx="2" className="fill-white dark:fill-zinc-950" />
      <rect x="11.6" y="6.6" width="8.8" height="2.3" rx="0.6" className="fill-violet-600" />
      <rect x="11.6" y="10.7" width="8.8" height="13.2" rx="0.8" className="fill-zinc-950 dark:fill-zinc-100" />
    </svg>
  );
}
