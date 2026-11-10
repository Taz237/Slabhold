/* Quick Comp: three text roles, one focus ring, one easing. Motion is motion-safe only. */

export const textSecondary = "text-zinc-600 dark:text-zinc-300";
export const textMuted = "text-zinc-500 dark:text-zinc-400";
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";
/** 150ms color feedback on the one curve. */
export const feedback =
  "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]";
/** A neutral control: 44px, 10px radius, hairline. */
export const control = `flex min-h-11 items-center rounded-[10px] bg-white ring-1 ring-zinc-950/10 dark:bg-white/[0.04] dark:ring-white/10 ${focusRing}`;
/** Section label above a group. */
export const sectionLabel = `text-[13px] leading-5 font-medium ${textMuted}`;
