import {
  TIER_LABELS,
  CATEGORY_COPY,
  badgeFrameSrc,
  badgeIconSrc,
  type BadgeCategory,
  type BadgeTier,
} from "@/lib/badges/config";

/** The icon sits in the frame's well at 0.379 scale about the center. */
const ICON_SCALE = 0.379;
const ICON_BOX = {
  left: `${((1 - ICON_SCALE) / 2) * 100}%`,
  top: `${((1 - ICON_SCALE) / 2) * 100}%`,
  width: `${ICON_SCALE * 100}%`,
  height: `${ICON_SCALE * 100}%`,
};
const RING_RADIUS = 116;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Ring and lock dot thicken at small sizes so a 32px badge stays legible. */
function ringStroke(size: number) {
  return Math.max(12, (512 * 2) / size);
}

function lockRadius(size: number) {
  return Math.max(22, (512 * 4) / size);
}

export function badgeLabel(category: BadgeCategory, tier: BadgeTier, locked = false): string {
  const name = `${CATEGORY_COPY[category].label}, ${TIER_LABELS[tier]}`;
  return locked ? `${name}, locked` : name;
}

export function Badge({
  tier,
  category,
  size = 64,
  locked = false,
  progress = null,
  animate = true,
  label,
  className = "",
}: {
  tier: BadgeTier;
  category: BadgeCategory;
  size?: number;
  locked?: boolean;
  /** 0 to 1. Shows the progress ring on a locked badge. */
  progress?: number | null;
  /** Legendary pulse and shine. Off for lists; CSS also stops it for reduced motion. */
  animate?: boolean;
  /** Accessible name. Pass "" when a caption already names the badge. */
  label?: string;
  className?: string;
}) {
  const legendary = tier === "legendary" && !locked && animate;
  const name = label ?? badgeLabel(category, tier, locked);
  const iconMask = `url(${badgeIconSrc(category)})`;
  return (
    <span
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      data-badge={`${category}:${tier}`}
      data-locked={locked ? "true" : undefined}
      className={`relative inline-block shrink-0 select-none ${legendary ? "badge-legendary" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      {legendary ? <span aria-hidden className="badge-aura" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={badgeFrameSrc(tier, locked)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full"
      />
      {locked ? (
        <span
          aria-hidden
          className="absolute bg-[#3F3F46]"
          style={{
            ...ICON_BOX,
            maskImage: iconMask,
            WebkitMaskImage: iconMask,
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badgeIconSrc(category)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute"
          style={ICON_BOX}
        />
      )}
      {legendary ? <span aria-hidden className="badge-shine" /> : null}
      {locked ? <LockedOverlay size={size} progress={progress} /> : null}
    </span>
  );
}

function LockedOverlay({ size, progress }: { size: number; progress: number | null }) {
  const stroke = ringStroke(size);
  const dot = lockRadius(size);
  const filled = progress == null ? 0 : Math.max(0, Math.min(1, progress)) * RING_LENGTH;
  const s = dot / 22;
  return (
    <svg aria-hidden viewBox="0 0 512 512" className="absolute inset-0 h-full w-full">
      {progress != null ? (
        <>
          <circle cx="256" cy="256" r={RING_RADIUS} fill="none" stroke="#27272A" strokeWidth={stroke} />
          {filled > 0 ? (
            <circle
              data-ring
              cx="256"
              cy="256"
              r={RING_RADIUS}
              fill="none"
              stroke="#A78BFA"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled.toFixed(2)} ${RING_LENGTH.toFixed(2)}`}
              transform="rotate(-90 256 256)"
            />
          ) : null}
        </>
      ) : null}
      <g transform={`translate(256 ${256 + RING_RADIUS}) scale(${s})`}>
        <circle r="22" fill="#09090B" />
        <path d="M-5.5 -2.5 V-6 a5.5 5.5 0 0 1 11 0 V-2.5" fill="none" stroke="#A1A1AA" strokeWidth="2.6" />
        <rect x="-8" y="-3" width="16" height="12" rx="2.4" fill="#A1A1AA" />
      </g>
    </svg>
  );
}
