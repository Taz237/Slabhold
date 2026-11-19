"use client";

import { useEffect, useState } from "react";
import { Share } from "lucide-react";
import { SheetLoadFailed } from "@/components/part-load-failed";
import { afterFirstIdle } from "@/lib/ui/idle";
import { lazyPart } from "@/lib/ui/lazy-part";
import { pressTick } from "@/lib/ui/press-tick";

/*
 * The sheet only draws after a tap, so it is its own chunk and the profile's
 * first load doesn't carry the share preview. It is fetched at the first idle
 * moment and again on the press, so it is in hand before the tap lands.
 */
const ShareSheet = lazyPart(
  () => import("@/components/profile/profile-share-sheet-view").then((mod) => mod.ProfileShareSheetView),
  null,
  { name: "profile-share-sheet", failed: SheetLoadFailed },
);

/**
 * The share control on your own profile. It opens a sheet with Share profile
 * and the "Share my collection" actions the profile used to show as a box.
 * On someone else's profile the control is ShareIconButton, which shares the
 * profile link at once.
 */
export function ProfileShareButton({
  username,
  path,
  title,
  label,
}: {
  username: string;
  path: string;
  title: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => afterFirstIdle(ShareSheet.warm), []);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onPointerDown={ShareSheet.warm}
        onClick={() => {
          pressTick();
          ShareSheet.warm();
          setOpen(true);
        }}
        className="hit-44 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-300 text-zinc-800 dark:border-white/20 dark:text-zinc-100"
      >
        <Share className="h-4 w-4" />
      </button>
      {open ? <ShareSheet username={username} path={path} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
