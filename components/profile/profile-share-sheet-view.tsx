"use client";

import { Link2 } from "lucide-react";
import { CollectionSheet } from "@/components/collection-sheet";
import { PreviewThumb, ShareCollectionActions } from "@/components/invite/share-collection-card";
import { CopiedToast, useShare } from "@/components/share-button";
import { collectionSharePath } from "@/lib/share/links";

/**
 * What the share control on your own profile opens: Share profile (the link
 * to your profile, as the control did before), then your collection's link
 * preview with Share, Post on X and Save for Stories. Its own chunk, fetched
 * ahead of the tap (components/profile/profile-share-button.tsx).
 */
export function ProfileShareSheetView({
  username,
  path,
  title,
  onClose,
}: {
  username: string;
  /** The profile link. */
  path: string;
  title: string;
  onClose: () => void;
}) {
  const { copied, share } = useShare(path, title, title);
  return (
    <CollectionSheet title="Share" onClose={onClose}>
      <button
        type="button"
        data-share-profile=""
        onClick={(event) => void share(event)}
        className="tap inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-zinc-300 px-4 text-14 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-white/15"
      >
        <Link2 aria-hidden className="h-4 w-4" />
        Share profile
      </button>
      <p className="mt-5 mb-2 text-13 font-medium text-zinc-500">My collection</p>
      <PreviewThumb src={`${collectionSharePath(username)}/opengraph-image`} />
      <div className="mt-3">
        <ShareCollectionActions />
      </div>
      {copied ? <CopiedToast /> : null}
    </CollectionSheet>
  );
}
