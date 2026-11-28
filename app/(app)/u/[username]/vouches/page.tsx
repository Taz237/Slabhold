import type { Metadata } from "next";
import { VouchesRoute } from "@/components/vouches/vouches-route";
import { requireProfile } from "@/lib/social/require-record";
import { VOUCH_COPY } from "@/lib/vouches/rules";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: VOUCH_COPY.pageMetaTitle(decodeURIComponent(username).replace(/^@/, "")) };
}

/** Everyone can read a person's vouches and replies. A missing profile is a 404. */
export default async function UserVouchesPage({ params }: Props) {
  const { username } = await params;
  const name = decodeURIComponent(username);
  await requireProfile(name);
  return <VouchesRoute username={name} />;
}
