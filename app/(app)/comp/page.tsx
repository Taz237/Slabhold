import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { QuickCompLazy } from "@/components/quick-comp/quick-comp-lazy";
import { loginPath } from "@/lib/auth/safe-next";
import { QUICK_COMP_PATH, quickCompEnabled } from "@/lib/quick-comp/flag";
import { getAuthUserId } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Comp a card · Slabhold" };

/**
 * Quick Comp. A 404 with the flag off. Signed out, it sends you to log in
 * from here rather than from the shared route table, so the app shell's
 * code is the same with the flag off.
 */
export default async function QuickCompPage() {
  if (!quickCompEnabled()) notFound();
  const userId = await getAuthUserId();
  if (!userId) redirect(loginPath(QUICK_COMP_PATH));
  return <QuickCompLazy userId={userId} />;
}
