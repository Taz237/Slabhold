/** A collector's photo, or their first letter on their accent. Decorative: the row names the person. */
export function LeaderboardAvatar({
  title,
  accent,
  url,
  size,
}: {
  title: string;
  accent: string;
  url: string | null;
  size: number;
}) {
  const letter = title.trim().slice(0, 1).toUpperCase() || "?";
  const photo = url?.trim() ?? "";
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-cover bg-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: accent || "#7c5cff",
        backgroundImage: photo ? `url("${photo.replace(/["\\\n\r]/g, "")}")` : undefined,
        fontSize: size >= 60 ? 26 : size >= 48 ? 20 : 15,
      }}
    >
      {photo ? "" : letter}
    </span>
  );
}
