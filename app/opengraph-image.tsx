import { ogContentType, ogSize, renderHomeOg } from "@/components/og-frame";

export const alt = "Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderHomeOg();
}
