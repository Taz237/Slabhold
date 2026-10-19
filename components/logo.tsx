export const LOGO_SRC = "/logo.svg";

/** Shared purple-star mark. Same file as the favicon (`public/logo.svg`). */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
      width={32}
      height={32}
      className={className}
    />
  );
}
