import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InviteLanding } from "@/components/invite/invite-landing";
import { inviteHandle } from "@/lib/invites/attribution";
import { INVITE_CODE_PARAM, inviteCode } from "@/lib/invites/code";
import { loadInviteCollector } from "@/lib/invites/load";
import { previewMetadata } from "@/lib/social/link-preview";
import { userHref } from "@/lib/social/user-href";
import { getAuthUserId } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTION = "Slabhold is the home for your card collection, and the collectors you follow.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const handle = inviteHandle(username);
  const collector = handle ? await loadInviteCollector(handle) : null;
  return previewMetadata({
    title: collector ? `${collector.displayName} invited you to Slabhold` : "You're invited to Slabhold",
    description: DESCRIPTION,
    imageUrl: null,
    detail: "",
  });
}

/** Personal invite link. Unknown, reserved or private handles get the generic invite, never a 404. */
export default async function InvitePage({ params, searchParams }: Props) {
  const { username } = await params;
  const handle = inviteHandle(username);
  const code = inviteCode((await searchParams)[INVITE_CODE_PARAM]);
  const collector = handle ? await loadInviteCollector(handle) : null;
  // Already signed in: go straight to their profile, where Follow is.
  if (collector && (await getAuthUserId())) redirect(userHref(collector.username));
  return <InviteLanding handle={handle} code={code} collector={collector} />;
}
