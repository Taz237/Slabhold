import { ogContentType, ogSize } from "@/components/og-frame";
import { inviteImageResponse } from "@/lib/invites/images";
import { loadInviteCollector } from "@/lib/invites/load";

export const alt = "An invite to Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return inviteImageResponse(await loadInviteCollector(username));
}
