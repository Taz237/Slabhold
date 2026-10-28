"use client";

import { useSyncExternalStore } from "react";
import { oldPromptsHidden } from "@/lib/onboarding/first-run";
import { idleOnboardingState, onboardingState, subscribeOnboarding } from "@/lib/onboarding/store";

export function useOnboarding() {
  return useSyncExternalStore(subscribeOnboarding, onboardingState, idleOnboardingState);
}

/** True while setup, "You're in" or the tour is up, so older prompts wait. */
export function useOnboardingBusy(): boolean {
  const state = useOnboarding();
  return oldPromptsHidden({
    setupActive: state.setupActive,
    celebrating: state.celebrating || state.welcomePending,
    tourOpen: state.tourIndex !== null,
  });
}
