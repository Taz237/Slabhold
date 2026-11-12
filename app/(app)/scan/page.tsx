import { ScanHub } from "@/components/scan/scan-hub";
import { ScanView } from "@/components/scan-view";
import { scanPurposeFrom, scannerEnabled } from "@/lib/scan/entry";

/**
 * /scan: the card scanner when it is on (/scan to add, /scan?for=comp to see
 * what it sold for). Off, the photo screen it has always been.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string | string[] }>;
}) {
  if (!scannerEnabled()) return <ScanView />;
  return <ScanHub purpose={scanPurposeFrom((await searchParams).for)} />;
}
