/**
 * contexts/I18nContext.tsx
 * React context provider for internationalization.
 *
 * Mount `I18nProvider` once (see `pages/_app.tsx`) and call `useTranslation()`
 * anywhere below it:
 *
 *   const { t, locale, setLocale } = useTranslation();
 *   <h1>{t("dashboard.title")}</h1>
 *
 * Initial locale (#1459): an explicit choice from the language picker always
 * wins, otherwise the browser's preferred language is used (`es-MX` opens in
 * Spanish), otherwise English. `setLocale()` persists the manual choice so
 * detection never overrides it again; `resetLocale()` hands control back to
 * detection.
 *
 * The context has an English default value, so components rendered without a
 * provider (for example in unit tests) keep working instead of throwing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  applyDocumentLocale,
  clearLocaleOverride,
  createTranslator,
  detectBrowserLocale,
  isLocale,
  resolveInitialLocale,
  setStoredLocale,
  type Locale,
  type Translate,
} from "@/lib/i18n";

export interface I18nContextValue {
  /** Active locale. */
  locale: Locale;
  /**
   * Switch locale: updates state, `<html lang>` and localStorage immediately.
   * The persisted choice wins over browser detection on every later visit.
   */
  setLocale: (locale: Locale) => void;
  /** Forget the manual choice and re-apply browser detection (#1459). */
  resetLocale: () => void;
  /** Translator bound to {@link I18nContextValue.locale}. */
  t: Translate;
  /** Locales the language picker can offer. */
  availableLocales: readonly Locale[];
}

/** English-only default so `useTranslation()` works outside a provider. */
export const defaultI18nValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  resetLocale: () => {},
  t: createTranslator(DEFAULT_LOCALE),
  availableLocales: SUPPORTED_LOCALES,
};

const I18nContext = createContext<I18nContextValue>(defaultI18nValue);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Hydration can't read localStorage or navigator, so the effective locale is
  // resolved on mount: manual choice first, then browser detection (#1459).
  useEffect(() => {
    const initial = resolveInitialLocale();
    setLocaleState(initial);
    applyDocumentLocale(initial);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;

    setLocaleState(next);
    setStoredLocale(next);
    applyDocumentLocale(next);
  }, []);

  const resetLocale = useCallback(() => {
    clearLocaleOverride();

    const detected = detectBrowserLocale();
    setLocaleState(detected);
    applyDocumentLocale(detected);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      resetLocale,
      t: createTranslator(locale),
      availableLocales: SUPPORTED_LOCALES,
    }),
    [locale, setLocale, resetLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Full i18n context, including locale control. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/**
 * Primary hook for components.
 *
 * @returns A `t(key, values?)` translator plus the active locale and setter.
 */
export function useTranslation() {
  const { t, locale, setLocale, resetLocale, availableLocales } =
    useContext(I18nContext);
  return { t, locale, setLocale, resetLocale, availableLocales };
}
