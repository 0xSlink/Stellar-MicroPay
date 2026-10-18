/**
 * __tests__/route-announcer.test.tsx
 * RouteAnnouncer announces client-side navigations to assistive tech (#1480).
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import RouteAnnouncer from "@/components/RouteAnnouncer";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n";

type Handler = (url: string) => void;

const mockOn = jest.fn();
const mockOff = jest.fn();

jest.mock("next/router", () => ({
  useRouter: () => ({
    events: { on: mockOn, off: mockOff },
  }),
}));

/** The most recently registered `routeChangeComplete` handler. */
function latestRouteHandler(): Handler {
  const calls = mockOn.mock.calls.filter(
    ([event]) => event === "routeChangeComplete"
  );
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as Handler;
}

/** Simulate a completed client-side navigation. */
function navigate(handler: Handler, url: string) {
  act(() => {
    handler(url);
  });
}

function flushAnnouncementDelay() {
  // The announcer clears the live region, waits 150ms, then writes the
  // message — advance past that delay.
  act(() => {
    jest.advanceTimersByTime(200);
  });
}

describe("RouteAnnouncer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOn.mockClear();
    mockOff.mockClear();
    document.title = "Home | Stellar MicroPay";
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("renders an empty assertive live region on mount", () => {
    render(<RouteAnnouncer />);

    const region = screen.getByTestId("route-announcer");
    expect(region).toHaveAttribute("aria-live", "assertive");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveClass("sr-only");
    expect(region).toBeEmptyDOMElement();

    // Subscribes to client-side route completions.
    expect(mockOn).toHaveBeenCalledWith(
      "routeChangeComplete",
      expect.any(Function)
    );
  });

  it("does not announce anything on the initial page load", () => {
    render(<RouteAnnouncer />);

    flushAnnouncementDelay();

    expect(screen.getByTestId("route-announcer")).toBeEmptyDOMElement();
  });

  it("announces the destination page title after a route change", () => {
    render(<RouteAnnouncer />);
    const handler = latestRouteHandler();

    document.title = "Transactions | Stellar MicroPay";
    navigate(handler, "/transactions");
    flushAnnouncementDelay();

    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Navigated to Transactions | Stellar MicroPay"
    );
  });

  it("re-announces when navigating to a page with the same title twice", () => {
    render(<RouteAnnouncer />);
    const handler = latestRouteHandler();

    document.title = "Dashboard | Stellar MicroPay";
    navigate(handler, "/dashboard");
    flushAnnouncementDelay();
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Navigated to Dashboard | Stellar MicroPay"
    );

    // Second navigation to the same page: the region is cleared first so
    // assistive tech re-announces the identical string.
    navigate(handler, "/dashboard");
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(/^$/);
    flushAnnouncementDelay();
    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Navigated to Dashboard | Stellar MicroPay"
    );
  });

  it("only announces the final destination for rapid successive navigations", () => {
    render(<RouteAnnouncer />);
    const handler = latestRouteHandler();

    document.title = "Home | Stellar MicroPay";
    navigate(handler, "/");

    act(() => {
      jest.advanceTimersByTime(50);
    });

    document.title = "Trade | Stellar MicroPay";
    navigate(handler, "/trade");
    flushAnnouncementDelay();

    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Navigated to Trade | Stellar MicroPay"
    );
  });

  it("unsubscribes from router events on unmount", () => {
    const { unmount } = render(<RouteAnnouncer />);
    const handler = latestRouteHandler();

    unmount();

    expect(mockOff).toHaveBeenCalledWith("routeChangeComplete", handler);
  });

  it("announces in the active locale", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "es");

    render(
      <I18nProvider>
        <RouteAnnouncer />
      </I18nProvider>
    );

    // Re-read the handler after the provider resolved the locale on mount.
    const handler = latestRouteHandler();
    document.title = "Panel | Stellar MicroPay";
    navigate(handler, "/dashboard");
    flushAnnouncementDelay();

    expect(screen.getByTestId("route-announcer")).toHaveTextContent(
      "Navegado a Panel | Stellar MicroPay"
    );
  });
});
