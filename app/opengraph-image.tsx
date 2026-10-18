import { ogContentType, ogSize, renderOg } from "@/components/og-frame";

export const alt = "Slabhold";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg(
    {
      title: "Sports cards, together.",
      description: "Sports card portfolio, flips, and a feed of collectors.",
      imageUrl: null,
      detail: "Portfolio, flips, and a feed of collectors.",
    },
    "FOR COLLECTORS",
  );
}
