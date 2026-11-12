import { SETS } from "@/lib/card-options";
import { ADD_FLOW_STEPS, resumeStep, stepSkipped, type AddFlowStep, type FlowAnswers } from "@/lib/cards/add-flow";
import { listedParallel } from "@/lib/cards/parallels";
import type { CatalogPickSnapshot } from "@/lib/catalog/catalog-queue";
import type { FieldSureness, ScanGrade, ScanMatch } from "./match";

/**
 * The scan's chosen match, handed to Add card. It travels in this tab's
 * sessionStorage (lib/capture.ts), never in a URL: a slab's cert number is
 * private. The URL only carries a random scan id so a stale handoff from an
 * earlier scan is never applied to a new one.
 */

export const SCAN_HANDOFF_VERSION = 1;

const SCAN_ID = /^[a-z0-9]{8,64}$/;
const MAX_TEXT = 120;
const SURENESS_KEYS = ["player", "year", "set", "number", "parallel"] as const;
const SURENESS_VALUES: readonly FieldSureness[] = ["sure", "likely", "unsure"];

export type ScanHandoff = {
  v: typeof SCAN_HANDOFF_VERSION;
  id: string;
  catalogId: string | null;
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  parallel: string;
  serialRun: number | null;
  serialNo: string;
  isRookie: boolean;
  isAuto: boolean;
  grade: ScanGrade | null;
  sureness: ScanMatch["sureness"];
  /** "Yes, add it": Add card saves on open instead of waiting on Review. */
  autoSave: boolean;
};

export function isScanId(value: string): boolean {
  return SCAN_ID.test(value);
}

/** A fresh id for one scan. Not a secret, just unique per scan. */
export function newScanId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Add card for this scan. Only the id goes in the URL. */
export function scanAddPath(id: string): string {
  return `/cards/new?scan=${id}`;
}

export function scanHandoffFrom(match: ScanMatch, id: string, options: { autoSave?: boolean } = {}): ScanHandoff {
  return {
    v: SCAN_HANDOFF_VERSION,
    id,
    catalogId: match.catalogId,
    playerName: match.playerName,
    sport: match.sport,
    yearLabel: match.yearLabel,
    setBrand: match.setBrand,
    cardNumber: match.cardNumber,
    parallel: match.parallel,
    serialRun: match.serialRun,
    serialNo: match.serialNo,
    isRookie: match.isRookie,
    isAuto: match.isAuto,
    grade: match.grade,
    sureness: match.sureness,
    autoSave: options.autoSave === true,
  };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.slice(0, MAX_TEXT);
}

function parseGrade(value: unknown): ScanGrade | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const grade = value as Record<string, unknown>;
  const fields = ["company", "number", "qualifier", "certNumber", "autoGrade"].map((key) => text(grade[key]));
  if (fields.some((field) => field == null) || typeof grade.authentic !== "boolean") return undefined;
  const [company, number, qualifier, certNumber, autoGrade] = fields as string[];
  return { company, number, qualifier, certNumber, authentic: grade.authentic, autoGrade };
}

function parseSureness(value: unknown): ScanMatch["sureness"] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const out = {} as ScanMatch["sureness"];
  for (const key of SURENESS_KEYS) {
    const item = raw[key];
    if (!SURENESS_VALUES.includes(item as FieldSureness)) return null;
    out[key] = item as FieldSureness;
  }
  return out;
}

/** A stored handoff, checked field by field. Null for anything else. */
export function parseScanHandoff(raw: string | null): ScanHandoff | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.v !== SCAN_HANDOFF_VERSION) return null;
  if (typeof data.id !== "string" || !isScanId(data.id)) return null;
  const strings = ["playerName", "sport", "yearLabel", "setBrand", "cardNumber", "parallel", "serialNo"] as const;
  const values: Partial<Record<(typeof strings)[number], string>> = {};
  for (const key of strings) {
    const item = text(data[key]);
    if (item == null) return null;
    values[key] = item;
  }
  if (data.catalogId !== null && typeof data.catalogId !== "string") return null;
  const catalogId = data.catalogId === null ? null : text(data.catalogId);
  const serialRun =
    data.serialRun === null
      ? null
      : typeof data.serialRun === "number" && Number.isInteger(data.serialRun) && data.serialRun >= 1
        ? data.serialRun
        : undefined;
  if (serialRun === undefined) return null;
  if (typeof data.isRookie !== "boolean" || typeof data.isAuto !== "boolean") return null;
  const grade = parseGrade(data.grade);
  if (grade === undefined) return null;
  const sureness = parseSureness(data.sureness);
  if (!sureness) return null;
  if (data.autoSave !== undefined && typeof data.autoSave !== "boolean") return null;
  return {
    v: SCAN_HANDOFF_VERSION,
    id: data.id,
    catalogId,
    playerName: values.playerName!,
    sport: values.sport!,
    yearLabel: values.yearLabel!,
    setBrand: values.setBrand!,
    cardNumber: values.cardNumber!,
    parallel: values.parallel!,
    serialRun,
    serialNo: values.serialNo!,
    isRookie: data.isRookie,
    isAuto: data.isAuto,
    grade,
    sureness,
    autoSave: data.autoSave === true,
  };
}

export type ScanCardStart = {
  form: {
    playerName: string;
    yearLabel: string;
    setBrand: string;
    cardNumber: string;
    /** "" when the scan couldn't tell. The picker opens on it. */
    parallel: string;
    serialRun: string;
    serialNo: string;
    sport: string;
  };
  setIsCustom: boolean;
  parallelIsCustom: boolean;
  isRookie: boolean;
  isAuto: boolean;
  /** "" for a raw card: Add card keeps its own default. */
  gradeCompany: string;
  gradeNumber: string;
  gradeQualifier: string;
  certNumber: string;
  /** Compared at save time, like a catalog pick. Null when no catalog row backs the match. */
  snapshot: CatalogPickSnapshot | null;
};

/** The Add card fields for a scan, in the shapes CardForm keeps. */
export function scanCardStart(handoff: ScanHandoff): ScanCardStart {
  const form = {
    playerName: handoff.playerName,
    yearLabel: handoff.yearLabel,
    setBrand: handoff.setBrand,
    cardNumber: handoff.cardNumber,
    parallel: handoff.parallel,
    serialRun: handoff.serialRun != null ? String(handoff.serialRun) : "",
    serialNo: handoff.serialNo,
    sport: handoff.sport,
  };
  const setIsCustom = Boolean(form.setBrand) && !SETS.some((name) => name.toLowerCase() === form.setBrand.toLowerCase());
  const parallelIsCustom = Boolean(form.parallel) && listedParallel(form.setBrand, form.parallel) == null;
  return {
    form,
    setIsCustom,
    parallelIsCustom,
    isRookie: handoff.isRookie,
    isAuto: handoff.isAuto,
    gradeCompany: handoff.grade?.company ?? "",
    gradeNumber: handoff.grade?.number ?? "",
    gradeQualifier: handoff.grade?.qualifier ?? "",
    certNumber: handoff.grade?.certNumber ?? "",
    snapshot: handoff.catalogId
      ? {
          playerName: form.playerName,
          yearLabel: form.yearLabel,
          setBrand: form.setBrand,
          cardNumber: form.cardNumber,
          parallel: form.parallel || "Base",
        }
      : null,
  };
}

const SURENESS_STEPS: Record<(typeof SURENESS_KEYS)[number], AddFlowStep> = {
  player: "player",
  year: "year",
  set: "set",
  number: "number",
  parallel: "parallel",
};

/**
 * Where Add card opens for a scan: the first step that is still empty or the
 * scan wasn't sure of, then Numbered? when the parallel is numbered and no run
 * was read, else Review.
 */
export function scanOpeningStep(sureness: ScanMatch["sureness"], answers: FlowAnswers): AddFlowStep {
  const missing = resumeStep(answers);
  const unsure = SURENESS_KEYS.filter((key) => sureness[key] === "unsure").map((key) => SURENESS_STEPS[key]);
  const candidates = [...unsure, ...(missing === "review" ? [] : [missing])];
  if (candidates.length > 0) {
    return candidates.reduce((first, step) =>
      ADD_FLOW_STEPS.indexOf(step) < ADD_FLOW_STEPS.indexOf(first) ? step : first,
    );
  }
  if (!stepSkipped("serial", answers) && !answers.serialRun.trim()) return "serial";
  return "review";
}
