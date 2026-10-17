/**
 * hooks/useOnboarding.tsx
 * First-run onboarding tour state, persisted in localStorage.
 *
 * - `showTour` is true the first time the user opens the dashboard with a
 *   connected wallet (key #621/#625).
 * - `completeTour`/`skipTour` dismiss it for good.
 * - `resetOnboardingTour()` (used by Settings → Replay tour) clears the
 *   stored flag so the tour shows again on the next dashboard visit.
 */

import { useCallback, useEffect, useState } from "react";

const ONBOARDING_SEEN_KEY = "stellar-micropay:onboarding-seen";

/** Clear the "tour seen" flag so the tour plays again on next dashboard visit. */
export function resetOnboardingTour() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_SEEN_KEY);
  } catch (error) {
    console.error("Failed to reset onboarding state:", error);
  }
}

function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_SEEN_KEY) === "true";
  } catch (error) {
    console.error("Failed to read onboarding state:", error);
    return false;
  }
}

/**
 * @param enabled Only run the tour when this is true (i.e. a wallet is connected).
 */
export function useOnboarding(enabled: boolean) {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (enabled && !hasSeenTour()) {
      setShowTour(true);
    }
  }, [enabled]);

  const completeTour = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
      } catch (error) {
        console.error("Failed to save onboarding state:", error);
      }
    }
    setShowTour(false);
  }, []);

  const skipTour = completeTour;

  return { showTour, completeTour, skipTour };
}
