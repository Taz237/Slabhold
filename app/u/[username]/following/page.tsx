"use client";

import { useParams } from "next/navigation";
import { FollowList } from "@/components/follow-list";

export default function UserFollowingPage() {
  const params = useParams<{ username: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  return <FollowList kind="following" username={decodeURIComponent(username)} />;
}
