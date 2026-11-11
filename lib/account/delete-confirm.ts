/**
 * "Type DELETE to confirm". iOS capitalizes and autocorrects the first word,
 * so case and surrounding spaces don't matter.
 */
export function isDeleteConfirmation(typed: string): boolean {
  return typed.trim().toUpperCase() === "DELETE";
}
