/**
 * Value tab for the leaderboard tab registry owned by the weekly frame.
 * Mount ValueBoard with getValueBoard({ start, end }) so Last week can pass dates.
 * This module does not render the countdown, Last week control, top 10 row, or Provisional banner.
 */
export const VALUE_BOARD_TAB = {
  id: "value",
  label: "Value",
} as const;
