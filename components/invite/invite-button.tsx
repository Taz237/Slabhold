"use client";

import { UserPlus } from "lucide-react";
import { useShareSheet, type ShareTarget } from "@/components/share-sheet";
import { INVITE_SHARE_TEXT, invitePath } from "@/lib/share/links";

export function inviteTarget(username: string): ShareTarget {
  return {
    path: invitePath(username),
    title: "Invite a collector",
    text: INVITE_SHARE_TEXT,
    source: "invite",
  };
}

/**
 * Your invite link (/i/<username>) through the native share sheet on a phone.
 * On a computer, or when sharing fails, our sheet: Post on X and Copy link.
 */
export function useInviteShare(username: string) {
  return useShareSheet(inviteTarget(username));
}

/** On your own profile, next to Edit profile. */
export function InviteButton({ username, className }: { username: string; className: string }) {
  const { share, sheet } = useInviteShare(username);
  return (
    <>
      <button type="button" data-invite-button="" onClick={() => void share()} className={className}>
        <UserPlus aria-hidden className="mr-1.5 h-4 w-4" />
        Invite
      </button>
      {sheet}
    </>
  );
}
