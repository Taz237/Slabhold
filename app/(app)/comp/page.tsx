import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { QuickCompLazy } from "@/components/quick-comp/quick-comp-lazy";
import { loginPath } from "@/lib/auth/safe-next";
import { QUICK_COMP_PATH, quickCompEnabled } from "@/lib/quick-comp/flag";
import { scannerEnabled } from "@/lib/scan/entry";
import { getAuthUserId } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quick Comp · Slabhold" };

/**
 * Quick Comp lives on the Scan screen now: its search sits under the Scan button, so old /comp
 * links land there. A build without the scanner keeps Quick Comp on its own page. A 404 with the
 * flag off, as before.
 */
export default async function QuickCompPage() {
  if (!quickCompEnabled()) notFound();
  if (scannerEnabled()) redirect("/scan");
  const userId = await getAuthUserId();
  if (!userId) redirect(loginPath(QUICK_COMP_PATH));
  return <QuickCompLazy userId={userId} />;
}
