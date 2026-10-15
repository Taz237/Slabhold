"use client";

import { useParams } from "next/navigation";
import { MessageThread } from "@/components/message-thread";

export default function MessageThreadPage() {
  const params = useParams<{ username: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  return <MessageThread username={decodeURIComponent(username)} />;
}
