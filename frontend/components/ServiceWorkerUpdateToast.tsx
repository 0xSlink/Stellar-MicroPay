/**
 * components/ServiceWorkerUpdateToast.tsx
 * Surfaces waiting service worker updates as a toast (#1475) and reloads
 * once the user accepts.
 *
 * Flow:
 *   1. The browser installs a new /sw.js after a deploy. Because the SW does
 *      not call skipWaiting on install, the new worker enters "waiting" and
 *      the current one keeps controlling the tab.
 *   2. This component detects `registration.waiting` (or the `updatefound`
 *      → "installed" transition) and shows a translated toast with a
 *      Reload action.
 *   3. Accepting posts `{ type: "SKIP_WAITING" }` to the waiting worker. The
 *      SW calls self.skipWaiting(), activates, and its clients.claim() fires
 *      `controllerchange` in this tab — which then reloads exactly once.
 *   4. Dismissing (or letting the toast auto-dismiss) defers the update: no
 *      new prompt during the same tab session, so navigation never nags.
 */

import { useEffect, useRef } from "react";
import { useToastContext } from "@/lib/ToastContext";
import { useTranslation } from "@/contexts/I18nContext";

/** How long the prompt stays on screen before deferring. */
const UPDATE_TOAST_DURATION_MS = 10_000;

export default function ServiceWorkerUpdateToast() {
  const { addToast } = useToastContext();
  const { t } = useTranslation();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    // The reload must only follow a user-confirmed activation: the new worker
    // calls clients.claim() on activate, which fires `controllerchange` here.
    // Guarding with the flag avoids reloading when a first-install worker
    // takes control.
    let acceptedUpdate = false;

    const onControllerChange = () => {
      if (acceptedUpdate) window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const promptReload = (registration: ServiceWorkerRegistration) => {
      if (promptedRef.current) return;

      const waiting = registration.waiting;
      // `controller` only exists once a previous worker already ran this
      // page — i.e. a deploy is actually replacing an active version.
      if (!waiting || !navigator.serviceWorker.controller) return;

      promptedRef.current = true;
      addToast(t("pwaUpdate.available"), "info", {
        duration: UPDATE_TOAST_DURATION_MS,
        action: {
          label: t("pwaUpdate.reload"),
          onClick: () => {
            acceptedUpdate = true;
            waiting.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const observeRegistration = (registration: ServiceWorkerRegistration) => {
      promptReload(registration);

      // Take the toast live as soon as a freshly found update installs.
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") promptReload(registration);
        });
      });
    };

    // Either reuse the existing registration (e.g. registered by a page) or
    // register and start observing.
    navigator.serviceWorker
      .getRegistration()
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          observeRegistration(existing);
          return existing;
        }
        return navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            if (!cancelled) observeRegistration(registration);
          })
          .catch((error) => {
            console.warn("[PWA] Service worker registration failed:", error);
          });
      })
      .catch((error) => {
        console.warn("[PWA] Service worker update check failed:", error);
      });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [addToast, t]);

  return null;
}
