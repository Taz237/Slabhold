/**
 * Made-up cards for the profile Spotlight carousel run (scripts/profile-spotlight.e2e.mjs).
 * Invented names, drawn art (no photos, no likenesses, no logos), never a real user's data.
 */
const FIRST = ["Dax", "Tre", "Milo", "Cade", "Rune", "Jett", "Beau", "Knox", "Zane", "Odell", "Lior", "Emery", "Tobin", "Rafe", "Soren", "Kit"];
const LAST = ["Morrow", "Okafor", "Vance", "Hollis", "Reyes", "Castell", "Brandt", "Novak", "Idris", "Sato", "Quill", "Arden", "Marsh", "Leroux", "Pike", "Stroud"];
const SETS = ["Prizm", "Optic", "Select", "Chrome", "Mosaic", "Bowman"];
const PARALLELS = ["Base", "Silver", "Gold /10", "Purple /75", "Blue /199", "Red /149"];
const GRADES = ["PSA 10", "", "BGS 9.5", "", "SGC 10", "PSA 9", "", "CGC 9.5"];
const ACCENTS = ["#7c3aed", "#ef4444", "#3b82f6", "#f59e0b", "#14b8a6", "#22c55e", "#ec4899", "#a1a1aa"];

function svg(width, height, body) {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
}

/** A drawn card front: colour field, stripes, a big number and a name plate. */
function cardArt(index, accent, name, wide) {
  const [w, h] = wide ? [700, 500] : [500, 700];
  const number = (index * 7 + 3) % 99;
  return svg(
    w,
    h,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#111114"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="#f4f4f5"/>
<rect x="${w * 0.04}" y="${h * 0.04}" width="${w * 0.92}" height="${h * 0.92}" rx="14" fill="url(#g)"/>
<g opacity="0.16" stroke="#fff" stroke-width="18">${Array.from({ length: 9 }, (_, i) => `<line x1="${-200 + i * 130}" y1="${h}" x2="${100 + i * 130}" y2="0"/>`).join("")}</g>
<circle cx="${w * (wide ? 0.3 : 0.5)}" cy="${h * (wide ? 0.5 : 0.4)}" r="${Math.min(w, h) * 0.24}" fill="#ffffff" opacity="0.14"/>
<text x="${w * (wide ? 0.3 : 0.5)}" y="${h * (wide ? 0.6 : 0.47)}" font-family="Arial, sans-serif" font-size="${Math.min(w, h) * 0.3}" font-weight="700" text-anchor="middle" fill="#fff">${number}</text>
<rect x="${w * (wide ? 0.54 : 0.1)}" y="${h * (wide ? 0.62 : 0.76)}" width="${w * (wide ? 0.38 : 0.8)}" height="${h * 0.12}" rx="8" fill="#09090b" opacity="0.72"/>
<text x="${w * (wide ? 0.73 : 0.5)}" y="${h * (wide ? 0.7 : 0.84)}" font-family="Arial, sans-serif" font-size="${Math.min(w, h) * 0.05}" font-weight="600" text-anchor="middle" fill="#fff">${name.toUpperCase()}</text>`,
  );
}

/** A photo from before the cropper: the card lying on a table, with the table in the shot. */
function uncroppedArt(accent, name) {
  return svg(
    600,
    800,
    `<rect width="600" height="800" fill="#7a5a3c"/>
<g opacity="0.25" stroke="#3f2c1a" stroke-width="6">${Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${i * 60 + 20}" x2="600" y2="${i * 60 + 44}"/>`).join("")}</g>
<g transform="rotate(-4 300 400)"><rect x="150" y="190" width="300" height="420" rx="10" fill="#f4f4f5"/><rect x="162" y="202" width="276" height="396" rx="8" fill="${accent}"/>
<text x="300" y="430" font-family="Arial, sans-serif" font-size="120" font-weight="700" text-anchor="middle" fill="#fff">8</text>
<text x="300" y="560" font-family="Arial, sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="#fff">${name.toUpperCase()}</text></g>`,
  );
}

export function fixtureId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

/**
 * `count` cards. With 4 or more: card 2 is a sideways (landscape) raw card,
 * card 3 an old uncropped photo, and one has no photo (the designed placeholder).
 */
export function fixtureCards(count, { mixed = true } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const name = `${FIRST[index % FIRST.length]} ${LAST[(index * 5 + 3) % LAST.length]}`;
    const accent = ACCENTS[index % ACCENTS.length];
    const grade = GRADES[index % GRADES.length];
    const wide = mixed && count >= 4 && (index === 1 || index % 9 === 6) && !grade;
    const uncropped = mixed && count >= 4 && index === 2;
    const noPhoto = mixed && count >= 6 && index === 5;
    return {
      id: fixtureId(index),
      playerName: name,
      year: 2019 + (index % 6),
      setBrand: SETS[index % SETS.length],
      cardNumber: String(100 + index),
      sport: "Basketball",
      photoDataUrl: noPhoto ? null : uncropped ? uncroppedArt(accent, name) : cardArt(index, accent, name, wide),
      accent,
      estimatedSellPrice: 0,
      createdAt: new Date(Date.UTC(2025, 0, 1) - index * 86_400_000).toISOString(),
      grade,
      parallel: PARALLELS[index % PARALLELS.length],
      conditionType: grade ? "graded" : "raw",
      isRookie: index % 3 === 0,
      openToOffers: index % 4 === 0,
    };
  });
}

/** Stored values, highest first in fixture order. Every 7th card has none yet. */
export function fixtureValues(cards) {
  const values = {};
  cards.forEach((card, index) => {
    if (index % 7 === 6) return;
    const median = Math.round((2400 / (index + 1) + 12) * 100) / 100;
    values[card.id] = { status: "ok", median, low: median * 0.9, high: median * 1.1, nSales: 6, matchedAt: null };
  });
  return values;
}
