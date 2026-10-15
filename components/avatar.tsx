import { initials } from "@/lib/format";

export function Avatar({
  name,
  image,
  accent = "#7c5cff",
  className = "h-10 w-10",
}: {
  name: string;
  image?: string | null;
  accent?: string;
  className?: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={`rounded-full object-cover ${className}`} />
    );
  }

  return (
    <span
      className={`grid place-items-center rounded-full text-xs font-semibold text-white ${className}`}
      style={{
        background: `linear-gradient(160deg, ${accent}, color-mix(in oklab, ${accent} 35%, #09090b))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
