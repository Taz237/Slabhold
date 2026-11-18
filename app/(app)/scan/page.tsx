import { QuickCompLazy } from "@/components/quick-comp/quick-comp-lazy";
import { ScanHub } from "@/components/scan/scan-hub";
import { ScanView } from "@/components/scan-view";
import { scanStartFrom } from "@/lib/cards/add-card-sheet";
import { quickCompEnabled } from "@/lib/quick-comp/flag";
import { scannerEnabled } from "@/lib/scan/entry";
import { getAuthUserId } from "@/lib/supabase/server";

/**
 * /scan: one Scan flow. Scan the front and the back, see the card and what it sold for, and add it
 * in one tap (or back out if the price was all you wanted). Quick Comp's search sits under the
 * Scan button, with its own daily cap. Old /scan?for=comp links land here too. With the scanner
 * off, the photo screen it has always been.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string | string[]; start?: string | string[] }>;
}) {
  if (!scannerEnabled()) return <ScanView />;
  const params = await searchParams;
  const userId = quickCompEnabled() ? await getAuthUserId() : null;
  return <ScanHub start={scanStartFrom(params.start)} search={userId ? <QuickCompLazy userId={userId} embedded /> : null} />;
}
