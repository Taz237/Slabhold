/** What you collect, while it loads: the title, sport chips, the search field and Save. */
export function CollectSettingsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading what you collect</span>
      <h1 className="text-2xl font-semibold tracking-tight">What you collect</h1>
      <div className="skeleton-shimmer mt-3 h-4 w-64 max-w-full rounded-full" />
      <div className="mt-5 flex flex-wrap gap-2">
        {["w-24", "w-20", "w-24", "w-20"].map((width, index) => (
          <div key={index} className={`skeleton-shimmer h-11 rounded-full ${width}`} />
        ))}
      </div>
      <div className="skeleton-shimmer mt-6 h-11 w-full rounded-2xl" />
      <div className="skeleton-shimmer mt-6 h-11 w-24 rounded-full" />
    </div>
  );
}
