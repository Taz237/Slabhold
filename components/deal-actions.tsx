"use client";

import Link from "next/link";
import { outlineButton, solidButton } from "@/components/button-styles";
import {
  ADD_TO_COLLECTION_LABEL,
  CANCEL_DEAL_LABEL,
  CONFIRM_DEAL_LABEL,
  DECLINE_DEAL_LABEL,
  type DealActions,
} from "@/lib/deals/state";

export function DealActionButtons({
  actions,
  pending,
  addHref,
  onConfirm,
  onDecline,
  onCancel,
}: {
  actions: DealActions;
  pending?: boolean;
  addHref?: string | null;
  onConfirm?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}) {
  if (!actions.confirm && !actions.decline && !actions.cancel && !actions.addToCollection) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.confirm ? (
        <button type="button" disabled={pending} onClick={onConfirm} className={solidButton}>
          {CONFIRM_DEAL_LABEL}
        </button>
      ) : null}
      {actions.decline ? (
        <button type="button" disabled={pending} onClick={onDecline} className={outlineButton}>
          {DECLINE_DEAL_LABEL}
        </button>
      ) : null}
      {actions.cancel ? (
        <button type="button" disabled={pending} onClick={onCancel} className={outlineButton}>
          {CANCEL_DEAL_LABEL}
        </button>
      ) : null}
      {actions.addToCollection && addHref ? (
        <Link href={addHref} className={solidButton}>
          {ADD_TO_COLLECTION_LABEL}
        </Link>
      ) : null}
    </div>
  );
}
