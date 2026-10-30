import { FollowList } from "@/components/follow-list";
import { requireProfile } from "@/lib/social/require-record";

type Props = { params: Promise<{ username: string }> };

export default async function UserFollowersPage({ params }: Props) {
  const { username } = await params;
  const name = decodeURIComponent(username);
  await requireProfile(name);
  return <FollowList kind="followers" username={name} />;
}
