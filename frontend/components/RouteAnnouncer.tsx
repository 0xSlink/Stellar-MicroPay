/**
 * components/RouteAnnouncer.tsx
 * Announces client-side route changes to assistive technology (#1480).
 *
 * Next.js navigations don't reload the document, so the "page load"
 * announcement screen readers normally make never fires — a user moving from
 * Dashboard to Transactions via the Navbar may hear nothing at all. This
 * component keeps a visually hidden `aria-live="assertive"` region and writes
 * the destination page's document title into it on every
 * `routeChangeComplete`, following the route-announcer pattern.
 *
 * The region starts empty: the initial page load is announced natively by
 * browsers, and announcing on mount would only add noise. Because assistive
 * tech re-announces live-region text only when it *changes*, the previous
 * message is cleared before the next one is written, so two navigations to
 * the same page (via different links) both produce speech.
 *
 * Titles come from each page's `<Head><title>` (see `pages/*` and the
 * `pages.*` locale keys), so the announcement follows the active language.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "@/contexts/I18nContext";

/** Delay between clearing the live region and writing the new message. */
const ANNOUNCE_RESET_MS = 150;

export default function RouteAnnouncer() {
  const router = useRouter();
  const { t } = useTranslation();
  const [message, setMessage] = useState("");

  useEffect(() => {
    let resetTimer: number | undefined;

    const announce = () => {
      // Clear first so an identical consecutive title still re-announces,
      // and cancel any pending announcement from a rapid previous hop.
      window.clearTimeout(resetTimer);
      setMessage("");
      resetTimer = window.setTimeout(() => {
        setMessage(t("routeAnnouncer.navigatedTo", { title: document.title }));
      }, ANNOUNCE_RESET_MS);
    };

    router.events.on("routeChangeComplete", announce);

    return () => {
      router.events.off("routeChangeComplete", announce);
      window.clearTimeout(resetTimer);
    };
  }, [router.events, t]);

  return (
    <div
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
      data-testid="route-announcer"
    >
      {message}
    </div>
  );
}
