import { ScanHub } from "@/components/scan/scan-hub";
import { ScanView } from "@/components/scan-view";
import { scanStartFrom } from "@/lib/cards/add-card-sheet";
import { scanPurposeFrom, scannerEnabled } from "@/lib/scan/entry";

/**
 * /scan: the card scanner when it is on (/scan to add, /scan?for=comp to see
 * what it sold for). Off, the photo screen it has always been.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string | string[]; start?: string | string[] }>;
}) {
  if (!scannerEnabled()) return <ScanView />;
  const params = await searchParams;
  return <ScanHub purpose={scanPurposeFrom(params.for)} start={scanStartFrom(params.start)} />;
}
