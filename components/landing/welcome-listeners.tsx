"use client";

import { useEffect } from "react";
import { clearLogoutHome } from "@/lib/auth/logout-home";
import { listenForInstallPrompt } from "@/lib/pwa/install-prompt";

/**
 * The two AppShell effects signed-out Home still needs, since /welcome renders
 * outside AppChrome. Chrome fires beforeinstallprompt once per page load, so
 * a visitor who lands here and soft-navigates to /signup keeps the native
 * prompt. And landing here is where a logout was headed, so the flag clears.
 */
export function WelcomeListeners() {
  useEffect(() => {
    listenForInstallPrompt();
    clearLogoutHome();
  }, []);

  return null;
}
