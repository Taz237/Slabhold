import { redirect } from "next/navigation";
import { CollectSettings } from "@/components/collect-settings";
import { loginPath } from "@/lib/auth/safe-next";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CollectingPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect(loginPath("/settings/collecting"));
  return <CollectSettings />;
}
