"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useSocial } from "@/components/social-provider";
import { showCreateMenu } from "@/lib/social/show-create-menu";
import { useCloseOnOutsideTap } from "@/lib/ui/menu-outside-tap";

export function CreateMenu() {
  const pathname = usePathname();
  const { user } = useSocial();
  const visible = showCreateMenu(pathname, user);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useCloseOnOutsideTap(open, rootRef, () => setOpen(false));

  if (!visible) return null;

  const postHref = "/compose";
  const menuClass =
    "w-44 overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--background)] py-1 shadow-lg dark:border-white/10";

  return (
    <div ref={rootRef}>
      <button
        type="button"
        aria-label="Post"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="fixed right-[calc(max(0px,50vw-16rem)+1rem)] bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_10px_30px_-6px_rgba(124,58,237,0.65)] ring-1 ring-white/15 transition-transform duration-150 active:scale-95 motion-reduce:transition-none md:hidden"
      >
        <Plus className="h-6 w-6" strokeWidth={2.25} />
        <span className="text-[10px] font-bold leading-none">Post</span>
      </button>
      <button
        type="button"
        aria-label="Post"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-24 left-4 z-40 hidden h-14 w-14 flex-col items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_10px_30px_-6px_rgba(124,58,237,0.65)] ring-1 ring-white/15 transition-transform duration-150 active:scale-95 motion-reduce:transition-none md:flex"
      >
        <Plus className="h-6 w-6" strokeWidth={2.25} />
        <span className="text-[10px] font-bold leading-none">Post</span>
      </button>
      {open ? (
        <>
          <div
            role="menu"
            className={`fixed right-[calc(max(0px,50vw-16rem)+1rem)] bottom-[calc(9.25rem+env(safe-area-inset-bottom))] z-40 md:hidden ${menuClass}`}
          >
            <CreateMenuLinks postHref={postHref} onPick={() => setOpen(false)} />
          </div>
          <div role="menu" className={`fixed bottom-40 left-4 z-40 hidden md:block ${menuClass}`}>
            <CreateMenuLinks postHref={postHref} onPick={() => setOpen(false)} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function CreateMenuLinks({
  postHref,
  onPick,
}: {
  postHref: string;
  onPick: () => void;
}) {
  const item =
    "block min-h-11 px-4 py-2.5 text-left text-[15px] font-bold hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none dark:hover:bg-white/10";
  return (
    <>
      <Link href={postHref} role="menuitem" onClick={onPick} className={item}>
        Post
      </Link>
      <Link href="/cards/new" role="menuitem" onClick={onPick} className={item}>
        Add card
      </Link>
    </>
  );
}
