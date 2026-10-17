import { act, renderHook, waitFor } from "@testing-library/react";
import {
  resetOnboardingTour,
  useOnboarding,
} from "@/hooks/useOnboarding";

const STORAGE_KEY = "stellar-micropay:onboarding-seen";

describe("useOnboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it("shows the tour for a new user when onboarding is enabled", async () => {
    const { result } = renderHook(() => useOnboarding(true));

    await waitFor(() => expect(result.current.showTour).toBe(true));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current).toEqual({
      showTour: true,
      completeTour: expect.any(Function),
      skipTour: result.current.completeTour,
    });
  });

  it("does not show the tour until onboarding is enabled", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useOnboarding(enabled),
      { initialProps: { enabled: false } },
    );

    expect(result.current.showTour).toBe(false);
    rerender({ enabled: true });

    await waitFor(() => expect(result.current.showTour).toBe(true));
  });

  it("completes the tour and persists the seen flag for a later visit", async () => {
    const firstVisit = renderHook(() => useOnboarding(true));
    await waitFor(() => expect(firstVisit.result.current.showTour).toBe(true));

    act(() => firstVisit.result.current.completeTour());

    expect(firstVisit.result.current.showTour).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
    firstVisit.unmount();

    const returningVisit = renderHook(() => useOnboarding(true));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe("true"));
    expect(returningVisit.result.current.showTour).toBe(false);
  });

  it("uses the same completion behavior when the user skips", async () => {
    const { result } = renderHook(() => useOnboarding(true));
    await waitFor(() => expect(result.current.showTour).toBe(true));

    act(() => result.current.skipTour());

    expect(result.current.showTour).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("treats a throwing localStorage read as an unseen tour without crashing", async () => {
    const storageError = new Error("Storage access denied");
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw storageError;
    });
    const logError = jest.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useOnboarding(true));

    await waitFor(() => expect(result.current.showTour).toBe(true));
    expect(logError).toHaveBeenCalledWith(
      "Failed to read onboarding state:",
      storageError,
    );
  });

  it("dismisses the tour for this visit when persisting completion throws", async () => {
    const { result } = renderHook(() => useOnboarding(true));
    await waitFor(() => expect(result.current.showTour).toBe(true));
    const storageError = new Error("Storage quota exceeded");
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw storageError;
    });
    const logError = jest.spyOn(console, "error").mockImplementation(() => {});

    act(() => result.current.completeTour());

    expect(result.current.showTour).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(logError).toHaveBeenCalledWith(
      "Failed to save onboarding state:",
      storageError,
    );
  });

  it("resets the persisted completion flag", () => {
    localStorage.setItem(STORAGE_KEY, "true");

    resetOnboardingTour();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("logs and tolerates a localStorage removal failure", () => {
    const storageError = new Error("Storage access denied");
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw storageError;
    });
    const logError = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => resetOnboardingTour()).not.toThrow();
    expect(logError).toHaveBeenCalledWith(
      "Failed to reset onboarding state:",
      storageError,
    );
  });
});
