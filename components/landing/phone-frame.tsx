import type { ReactNode } from "react";

/**
 * A plain phone drawn in CSS around a piece of the app: a dark body, a
 * hairline edge and the camera pill. No brand marks, no screenshot. The
 * screen clips its content, so whatever is inside keeps its own layout.
 */
export function PhoneFrame({
  children,
  className = "",
  screenClassName = "",
}: {
  children: ReactNode;
  className?: string;
  /** Extra classes for the screen, e.g. its background. */
  screenClassName?: string;
}) {
  return (
    <div
      data-phone-frame=""
      className={`relative rounded-[44px] border border-white/15 bg-[#18181B] p-2 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.9)] ${className}`}
    >
      <div className={`relative h-full overflow-hidden rounded-[36px] bg-[#09090B] ${screenClassName}`}>
        <span aria-hidden className="absolute top-2.5 left-1/2 z-30 h-6 w-20 -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}
