import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import en from "@/locales/en.json";
import es from "@/locales/es.json";
import ar from "@/locales/ar.json";
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  PLURAL_CATEGORIES,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  applyDocumentLocale,
  clearLocaleOverride,
  createTranslator,
  detectBrowserLocale,
  getLocaleOverride,
  getStoredLocale,
  interpolate,
  isLocale,
  isRTL,
  lookupMessage,
  matchLocale,
  resolveInitialLocale,
  selectPluralCategory,
  setStoredLocale,
  translate,
} from "@/lib/i18n";
import { I18nProvider, useTranslation } from "@/contexts/I18nContext";

/**
 * Override the jsdom navigator's language preferences for a single test (#1459).
 * The own properties shadow jsdom's prototype getters and are removed again by
 * {@link restoreBrowserLanguages}. `navigator.language` defaults to
 * `languages[0]`.
 */
function setBrowserLanguages(languages: string[], language = languages[0] ?? "") {
  Object.defineProperty(window.navigator, "languages", {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "language", {
    value: language,
    configurable: true,
  });
}

/** Drop the overrides so other tests see jsdom's default `en-US`. */
function restoreBrowserLanguages() {
  const navigator = window.navigator as unknown as Record<string, unknown>;
  delete navigator.languages;
  delete navigator.language;
}

/** Flatten a nested locale object into a list of dot-path keys. */
function collectKeys(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];

  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    collectKeys(value, prefix ? `${prefix}.${key}` : key)
  );
}

describe("i18n core", () => {
  it("translates dot-path keys per locale", () => {
    expect(translate("en", "dashboard.title")).toBe("Dashboard");
    expect(translate("es", "dashboard.title")).toBe("Panel");
    expect(translate("ar", "dashboard.title")).toBe("لوحة التحكم");
    expect(translate("en", "sendPayment.memoPlaceholder")).toBe("Payment note...");
    expect(translate("es", "sendPayment.memoPlaceholder")).toBe("Nota del pago...");
    expect(translate("ar", "sendPayment.memoPlaceholder")).toBe("ملاحظة الدفع...");
  });

  it("returns the key itself when no locale defines it", () => {
    expect(translate("es", "does.not.exist")).toBe("does.not.exist");
  });

  it("interpolates named values and leaves unknown tokens intact", () => {
    expect(translate("en", "dashboard.selectedPeriod", { label: "Mar 2026" })).toBe(
      "Selected Period: Mar 2026"
    );
    expect(translate("es", "dashboard.selectedPeriod", { label: "mar 2026" })).toBe(
      "Período seleccionado: mar 2026"
    );
    expect(translate("en", "sendPayment.amount", { asset: "USDC" })).toBe(
      "Amount (USDC)"
    );
    expect(interpolate("{known} {unknown}", { known: "a" })).toBe("a {unknown}");
    expect(interpolate("no tokens", { unused: "x" })).toBe("no tokens");
    // Double braces are accepted as well, for catalogs that use `{{amount}}`.
    expect(interpolate("{{amount}} {asset}", { amount: 5, asset: "XLM" })).toBe(
      "5 XLM"
    );
  });

  it("binds a translator to a locale", () => {
    const t = createTranslator("es");
    expect(t("common.retry")).toBe("Reintentar");
    expect(t("dashboard.totalSent")).toBe("Total enviado");

    const tAr = createTranslator("ar");
    expect(tAr("common.retry")).toBe("إعادة المحاولة");
    expect(tAr("navbar.home")).toBe("الرئيسية");
  });

  it("looks up nested messages and reports misses as undefined", () => {
    expect(lookupMessage(en as never, "settings.language.title")).toBe("Language");
    expect(lookupMessage(en as never, "settings.language")).toBeUndefined();
    expect(lookupMessage(en as never, "settings.nope.deeper")).toBeUndefined();
  });

  it("stores plural forms as nested one/other keys (#1460)", () => {
    expect(lookupMessage(en as never, "dashboard.outgoingPayments.one")).toBe(
      "{count} outgoing payment"
    );
    expect(lookupMessage(en as never, "dashboard.outgoingPayments.other")).toBe(
      "{count} outgoing payments"
    );
    // The plural group itself is an object, not a string.
    expect(lookupMessage(en as never, "dashboard.outgoingPayments")).toBeUndefined();
    expect(PLURAL_CATEGORIES).toEqual(["zero", "one", "two", "few", "many", "other"]);
  });

  it("recognises supported locales only", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("he")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(SUPPORTED_LOCALES).toEqual(["en", "es", "ar"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALE_LABELS.es).toBe("Español");
    expect(LOCALE_LABELS.ar).toBe("العربية");
  });

  it("identifies RTL locales correctly (#1318)", () => {
    expect(isRTL("ar")).toBe(true);
    expect(isRTL("he")).toBe(true);
    expect(isRTL("en")).toBe(false);
    expect(isRTL("es")).toBe(false);
    expect(RTL_LOCALES).toEqual(["ar", "he"]);
  });

  it("persists and restores the locale from localStorage", () => {
    window.localStorage.clear();

    expect(getStoredLocale()).toBe("en");

    setStoredLocale("es");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
    expect(getStoredLocale()).toBe("es");

    window.localStorage.setItem(LOCALE_STORAGE_KEY, "klingon");
    expect(getStoredLocale()).toBe("en");
  });

  it("keeps <html lang> and <html dir> in sync with the locale (#1318)", () => {
    applyDocumentLocale("es");
    expect(document.documentElement.lang).toBe("es");
    expect(document.documentElement.dir).toBe("ltr");

    applyDocumentLocale("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");

    applyDocumentLocale("he");
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");

    applyDocumentLocale("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});

describe("plural selection (#1460)", () => {
  it("derives the plural category from the locale's CLDR rules", () => {
    expect(selectPluralCategory("en", 0)).toBe("other");
    expect(selectPluralCategory("en", 1)).toBe("one");
    expect(selectPluralCategory("en", 2)).toBe("other");

    expect(selectPluralCategory("es", 1)).toBe("one");
    expect(selectPluralCategory("es", 2)).toBe("other");

    // Arabic has six categories; the catalogs only define one/other today.
    expect(selectPluralCategory("ar", 0)).toBe("zero");
    expect(selectPluralCategory("ar", 1)).toBe("one");
    expect(selectPluralCategory("ar", 2)).toBe("two");
    expect(selectPluralCategory("ar", 3)).toBe("few");
    expect(selectPluralCategory("ar", 11)).toBe("many");
  });

  it("selects English plural forms without a count === 1 ternary", () => {
    expect(translate("en", "dashboard.outgoingPayments", { count: 1 })).toBe(
      "1 outgoing payment"
    );
    expect(translate("en", "dashboard.outgoingPayments", { count: 3 })).toBe(
      "3 outgoing payments"
    );
    expect(translate("en", "walletHealth.signers", { count: 1 })).toBe("1 signer");
    expect(translate("en", "walletHealth.signers", { count: 2 })).toBe("2 signers");
    // English uses the plural form for zero.
    expect(translate("en", "dashboard.incomingPayments", { count: 0 })).toBe(
      "0 incoming payments"
    );
  });

  it("selects Spanish plural forms", () => {
    expect(translate("es", "dashboard.outgoingPayments", { count: 1 })).toBe(
      "1 pago enviado"
    );
    expect(translate("es", "dashboard.outgoingPayments", { count: 4 })).toBe(
      "4 pagos enviados"
    );
    expect(translate("es", "walletHealth.trustlines", { count: 1 })).toBe(
      "1 línea de confianza"
    );
    expect(translate("es", "walletHealth.trustlines", { count: 3 })).toBe(
      "3 líneas de confianza"
    );
    expect(translate("es", "contacts.count", { count: 0 })).toBe("0 contactos");
  });

  it("falls back to `other` for categories the locale does not define", () => {
    // Arabic selects `few` for 3, which the catalog does not provide.
    expect(translate("ar", "contacts.count", { count: 3 })).toBe("3 جهات اتصال");
    expect(translate("ar", "contacts.count", { count: 1 })).toBe("1 جهة اتصال");
  });

  it("interpolates other placeholders alongside the count", () => {
    expect(
      translate("en", "transactions.showingLoaded", { shown: 3, count: 5 })
    ).toBe("Showing 3 of 5 loaded transactions");
    expect(
      translate("en", "transactions.showingLoaded", { shown: 1, count: 1 })
    ).toBe("Showing 1 of 1 loaded transaction");
    expect(
      translate("es", "transactions.showingLoaded", { shown: 1, count: 2 })
    ).toBe("Mostrando 1 de 2 transacciones cargadas");
  });

  it("keeps plain string keys working when a count is passed", () => {
    expect(translate("en", "dashboard.totalSent", { count: 3 })).toBe("Total Sent");
    expect(translate("es", "dashboard.totalSent", { count: 3 })).toBe("Total enviado");
  });

  it("works through a bound translator", () => {
    const t = createTranslator("es");
    expect(t("contacts.imported", { count: 1 })).toBe("Se importó 1 contacto");
    expect(t("contacts.imported", { count: 2 })).toBe("Se importaron 2 contactos");
  });
});

describe("browser locale detection (#1459)", () => {
  afterEach(() => {
    restoreBrowserLanguages();
  });

  describe("matchLocale", () => {
    it("ignores region and script subtags for supported languages", () => {
      expect(matchLocale("es-MX")).toBe("es");
      expect(matchLocale("es-ES")).toBe("es");
      expect(matchLocale("es-419")).toBe("es");
      expect(matchLocale("es")).toBe("es");
      expect(matchLocale("en-GB")).toBe("en");
      expect(matchLocale("ar-EG")).toBe("ar");
      expect(matchLocale("zh-Hant-TW")).toBeUndefined();
    });

    it("is case- and separator-insensitive", () => {
      expect(matchLocale("ES")).toBe("es");
      expect(matchLocale("es_MX")).toBe("es");
      expect(matchLocale("  es-MX  ")).toBe("es");
    });

    it("reports languages we ship no catalog for as unmatched", () => {
      expect(matchLocale("fr-FR")).toBeUndefined();
      expect(matchLocale("de")).toBeUndefined();
      expect(matchLocale("")).toBeUndefined();
      // Hebrew is a valid Locale for RTL layout (#1318) but ships no catalog.
      expect(matchLocale("he-IL")).toBeUndefined();
    });
  });

  describe("detectBrowserLocale", () => {
    it("prefers the first browser language that has a catalog", () => {
      expect(detectBrowserLocale(["fr-FR", "es-MX", "en-US"])).toBe("es");
      expect(detectBrowserLocale(["de-DE", "ar-EG"])).toBe("ar");
      expect(detectBrowserLocale(["en-US", "es-MX"])).toBe("en");
    });

    it("falls back to English for unsupported languages", () => {
      expect(detectBrowserLocale(["fr-FR", "de-DE"])).toBe("en");
      expect(detectBrowserLocale([])).toBe("en");
      expect(detectBrowserLocale([""])).toBe("en");
    });

    it("reads navigator.languages and then navigator.language", () => {
      setBrowserLanguages(["fr-FR", "es-MX"], "fr-FR");
      expect(detectBrowserLocale()).toBe("es");

      setBrowserLanguages([], "ar-EG");
      expect(detectBrowserLocale()).toBe("ar");

      setBrowserLanguages(["fr-FR"], "fr-FR");
      expect(detectBrowserLocale()).toBe("en");
    });
  });

  describe("resolveInitialLocale precedence", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    afterEach(() => {
      restoreBrowserLanguages();
    });

    it("detects on a first visit without writing an override", () => {
      setBrowserLanguages(["es-MX", "en-US"], "es-MX");

      expect(getLocaleOverride()).toBeNull();
      expect(resolveInitialLocale()).toBe("es");
      // Detection is not a manual choice, so storage stays untouched.
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    });

    it("falls back to English when the browser language is unsupported", () => {
      setBrowserLanguages(["fr-FR", "de-DE"], "fr-FR");
      expect(resolveInitialLocale()).toBe(DEFAULT_LOCALE);
    });

    it("lets an explicit choice win over detection, both ways round", () => {
      setStoredLocale("en");
      setBrowserLanguages(["es-MX"], "es-MX");
      expect(resolveInitialLocale()).toBe("en");

      setStoredLocale("es");
      setBrowserLanguages(["en-US"], "en-US");
      expect(resolveInitialLocale()).toBe("es");
    });

    it("ignores an unsupported stored value and detects again", () => {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, "klingon");
      setBrowserLanguages(["es-MX"], "es-MX");

      expect(getLocaleOverride()).toBeNull();
      expect(resolveInitialLocale()).toBe("es");
    });

    it("degrades to detection when localStorage throws (private mode)", () => {
      const getItem = jest
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("SecurityError: storage is disabled");
        });

      setBrowserLanguages(["es-MX"], "es-MX");

      try {
        expect(getLocaleOverride()).toBeNull();
        expect(getStoredLocale()).toBe(DEFAULT_LOCALE);
        expect(resolveInitialLocale()).toBe("es");
      } finally {
        getItem.mockRestore();
      }
    });

    it("returns to detection once the override is cleared", () => {
      setStoredLocale("ar");
      setBrowserLanguages(["es-MX"], "es-MX");
      expect(resolveInitialLocale()).toBe("ar");

      clearLocaleOverride();
      expect(getLocaleOverride()).toBeNull();
      expect(resolveInitialLocale()).toBe("es");
    });
  });
});

describe("locale files", () => {
  it("define exactly the same keys", () => {
    expect(collectKeys(es).sort()).toEqual(collectKeys(en).sort());
    expect(collectKeys(ar).sort()).toEqual(collectKeys(en).sort());
  });

  it("have no empty strings", () => {
    const empty = [en, es, ar].flatMap((tree) =>
      collectKeys(tree).filter((key) => lookupMessage(tree as never, key) === "")
    );

    expect(empty).toEqual([]);
  });
});

/** Small consumer that exposes the hook's API to assertions. */
function LocaleProbe() {
  const { t, locale, setLocale, resetLocale, availableLocales } =
    useTranslation();

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="heading">{t("dashboard.title")}</span>
      <span data-testid="count">
        {t("dashboard.outgoingPayments", { count: 3 })}
      </span>
      <span data-testid="available">{availableLocales.join(",")}</span>
      <button onClick={() => setLocale("es")}>switch-es</button>
      <button onClick={() => setLocale("en")}>switch-en</button>
      <button onClick={() => setLocale("ar")}>switch-ar</button>
      <button onClick={resetLocale}>reset-locale</button>
    </div>
  );
}

describe("I18nProvider / useTranslation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    restoreBrowserLanguages();
  });

  it("defaults to English without a provider", () => {
    render(<LocaleProbe />);

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("heading")).toHaveTextContent("Dashboard");
    expect(screen.getByTestId("available")).toHaveTextContent("en,es,ar");
  });

  it("switches locale immediately without a page reload", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    expect(screen.getByTestId("heading")).toHaveTextContent("Dashboard");

    await user.click(screen.getByRole("button", { name: "switch-es" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("es");
    expect(screen.getByTestId("heading")).toHaveTextContent("Panel");
    expect(screen.getByTestId("count")).toHaveTextContent("3 pagos enviados");
    expect(document.documentElement.lang).toBe("es");

    await user.click(screen.getByRole("button", { name: "switch-en" }));
    expect(screen.getByTestId("heading")).toHaveTextContent("Dashboard");
    expect(document.documentElement.lang).toBe("en");
  });

  it("persists the chosen locale and restores it on mount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "switch-es" }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");

    unmount();

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("es")
    );
    expect(screen.getByTestId("heading")).toHaveTextContent("Panel");
  });

  it("opens in the browser language on a first visit (#1459)", async () => {
    setBrowserLanguages(["es-MX", "en-US"], "es-MX");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("es")
    );
    expect(screen.getByTestId("heading")).toHaveTextContent("Panel");
    expect(document.documentElement.lang).toBe("es");
    // Detection alone never becomes a stored override.
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("opens in English when the browser language has no catalog (#1459)", async () => {
    setBrowserLanguages(["fr-FR", "de-DE"], "fr-FR");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("en")
    );
    expect(screen.getByTestId("heading")).toHaveTextContent("Dashboard");
    expect(document.documentElement.lang).toBe("en");
  });

  it("keeps a manual choice when the browser language disagrees (#1459)", async () => {
    const user = userEvent.setup();
    setBrowserLanguages(["es-MX", "en-US"], "es-MX");

    const { unmount } = render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("es")
    );

    // The visitor picks English by hand; the choice is persisted.
    await user.click(screen.getByRole("button", { name: "switch-en" }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    unmount();

    // A later visit with the same Spanish browser must still render English.
    setBrowserLanguages(["es-MX", "en-US"], "es-MX");
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("en")
    );
    expect(screen.getByTestId("heading")).toHaveTextContent("Dashboard");
  });

  it("hands control back to detection with resetLocale() (#1459)", async () => {
    const user = userEvent.setup();
    setBrowserLanguages(["es-MX", "en-US"], "es-MX");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("es")
    );

    await user.click(screen.getByRole("button", { name: "switch-en" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");

    await user.click(screen.getByRole("button", { name: "reset-locale" }));

    await waitFor(() =>
      expect(screen.getByTestId("locale")).toHaveTextContent("es")
    );
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });
});
