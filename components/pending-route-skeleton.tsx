import { CollectionSkeleton, LoadingRows, ProfileSkeleton } from "@/components/status";

function body(pathname: string) {
  if (pathname.startsWith("/profile")) return <ProfileSkeleton />;
  if (pathname.startsWith("/collection") || pathname.startsWith("/portfolio")) return <CollectionSkeleton />;
  const label = pathname.startsWith("/notifications")
    ? "Loading notifications"
    : pathname.startsWith("/messages")
      ? "Loading messages"
      : "Loading";
  return (
    <div className="-mx-4 -mt-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <LoadingRows count={5} />
    </div>
  );
}

/**
 * An account page before the session loads (app-shell.tsx). It used to be a
 * blank screen. Now the header band and the page's own skeleton hold the
 * space, in the same boxes the page lands in. Hidden by CSS unless the
 * session hint says someone is signed in, so a visitor on their way to Log in
 * never sees a page they can't open.
 */
export function PendingRouteSkeleton({ pathname }: { pathname: string }) {
  const wide = pathname.startsWith("/collection") || pathname.startsWith("/portfolio");
  return (
    <div data-pending-route-skeleton="" className="min-h-dvh bg-[var(--background)]">
      <div className="h-[var(--app-header-h)] border-b border-zinc-200 dark:border-white/10" />
      <div className={`mx-auto w-full px-4 py-5 ${wide ? "max-w-5xl" : "max-w-lg"}`}>{body(pathname)}</div>
    </div>
  );
}
