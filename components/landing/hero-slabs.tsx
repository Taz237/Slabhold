import type { CSSProperties } from "react";
import { CardSlabArt } from "@/components/card-slab-art";
import { SAMPLE_SLABS } from "@/components/landing/sample-cards";

const NO_PHOTO = { kind: "none" } as const;
const noop = () => {};

/** Three sample slabs, fanned, drifting slowly. CSS only; still for reduced motion. */
const PLACES: { className: string; style: CSSProperties }[] = [
  {
    className: "left-[6%] top-[14%] w-[34%] z-10",
    style: { "--tilt": "-9deg", animationDelay: "-2.4s" } as CSSProperties,
  },
  {
    className: "left-1/2 top-0 w-[40%] -translate-x-1/2 z-20",
    style: { "--tilt": "0deg", animationDelay: "0s" } as CSSProperties,
  },
  {
    className: "right-[6%] top-[14%] w-[34%] z-10",
    style: { "--tilt": "9deg", animationDelay: "-4.8s" } as CSSProperties,
  },
];

export function HeroSlabs() {
  return (
    <div aria-hidden className="relative mx-auto aspect-[16/11] w-full max-w-[360px]" data-hero-slabs>
      <div className="absolute inset-x-[12%] top-[18%] bottom-[8%] rounded-full bg-[#7C3AED] opacity-45 blur-[56px]" />
      {SAMPLE_SLABS.map((card, index) => (
        <div key={card.playerName} className={`absolute ${PLACES[index].className}`}>
          <div className="landing-float drop-shadow-[0_18px_40px_rgba(124,58,237,0.45)]" style={PLACES[index].style}>
            <CardSlabArt card={card} index={index} source={NO_PHOTO} status="loading" onStatus={noop} sizes="140px" />
          </div>
        </div>
      ))}
    </div>
  );
}
