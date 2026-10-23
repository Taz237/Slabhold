import Link from "next/link";
import { initials } from "@/lib/format";
import { TRENDING_HEADING, shouldShowTrending, type TrendingItem } from "@/lib/social/trending";

function Face({ name, image, accent }: { name: string; image: string | null; accent: string }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- collector avatars are already hosted urls
      <img src={image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
    );
  }
  const label = initials(name) || name.slice(0, 1).toUpperCase();
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ background: accent }}
    >
      {label}
    </span>
  );
}

const RAIL_CLASS = "min-h-44 border-b border-zinc-200 px-4 py-3 dark:border-white/10";

/** Holds the rail's height until the cached ranking is ready, so Moving today stays put. */
export function TrendingNowSkeleton() {
  return (
    <section aria-hidden="true" data-trending-skeleton="" className={RAIL_CLASS}>
      <div className="mb-2 h-4 w-28 rounded bg-zinc-100 dark:bg-white/10" />
      <div className="flex gap-2 overflow-hidden pb-1">
        <div className="h-24 w-60 shrink-0 rounded-2xl bg-zinc-100 dark:bg-white/10" />
        <div className="h-24 w-60 shrink-0 rounded-2xl bg-zinc-100 dark:bg-white/10" />
      </div>
    </section>
  );
}

/** Horizontal rail. Renders nothing under the activity minimum. */
export function TrendingNowStrip({ items }: { items: readonly TrendingItem[] }) {
  if (!shouldShowTrending(items)) return null;

  return (
    <section aria-label={TRENDING_HEADING} data-trending-now="" className={RAIL_CLASS}>
      <h2 className="mb-2 text-sm font-semibold">{TRENDING_HEADING}</h2>
      <div className="flex gap-2 overflow-x-auto pb-1 max-md:pr-20" data-no-pull="">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex min-h-11 w-60 shrink-0 gap-2.5 rounded-2xl border border-zinc-200 p-2.5 dark:border-white/10"
          >
            <Face name={item.displayName} image={item.avatarUrl} accent={item.accent} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{item.displayName}</span>
              <span className="block truncate text-xs text-zinc-500">@{item.username}</span>
              {item.excerpt ? (
                <span className="mt-1 line-clamp-2 break-words text-xs leading-4">{item.excerpt}</span>
              ) : null}
              {item.player ? (
                <span className="mt-1 block truncate text-xs text-zinc-500">{item.player}</span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
