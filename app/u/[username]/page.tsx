"use client";

import { useParams } from "next/navigation";
import { ProfileView } from "@/components/profile-view";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  return <ProfileView username={username} />;
}
