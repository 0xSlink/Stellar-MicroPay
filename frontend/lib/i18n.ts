/**
 * lib/i18n.ts
 * Lightweight internationalization for Stellar MicroPay.
 *
 * Messages live in `locales/<locale>.json` as nested objects and are addressed
 * with dot-path keys, e.g. `t("dashboard.totalSent")`. Values may interpolate
 * with `{placeholders}`, and any key missing from the active locale falls back
 * to English before finally falling back to the key itself — so a half
 * translated locale never renders `undefined`.
 *
 * Counts use CLDR plural categories (`Intl.PluralRules`). A key that varies by
 * count is stored as a nested object with `one` / `other` children instead of a
 * string:
 *
 *   "dashboard": {
 *     "outgoingPayments": {
 *       "one": "{count} outgoing payment",
 *       "other": "{count} outgoing payments"
 *     }
 *   }
 *
 * Callers just pass the count and never write `count === 1 ?` themselves:
 *
 *   t("dashboard.outgoingPayments", { count: 3 }) // "3 outgoing payments"
 *
 * On a first visit the active locale comes from the browser (#1459):
 * `navigator.languages` / `navigator.language` are matched against the shipped
 * catalogs, so a Spanish browser opens in Spanish. An explicit choice from the
 * language picker is persisted and always wins over detection.
 *
 * No external dependency is used; the whole system is ~200 lines.
 */

import en from "@/locales/en.json";
import es from "@/locales/es.json";
import ar from "@/locales/ar.json";

/** Locales the app ships with. */
export type Locale = "en" | "es" | "ar" | "he";

/** English is the default and the fallback for every missing key. */
export const DEFAULT_LOCALE: Locale = "en";

/** Every supported locale, in picker order. */
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "es", "ar"];

/** Locales that use right-to-left layout (#1318). */
export const RTL_LOCALES: readonly Locale[] = ["ar", "he"];

/** Check whether a locale requires right-to-left (RTL) text direction (#1318). */
export function isRTL(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale as Locale);
}

/** localStorage key holding the user's chosen locale. */
export const LOCALE_STORAGE_KEY = "stellar-micropay:locale";

/** Human-readable locale names, shown in the language picker. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  ar: "العربية",
  he: "עברית",
};

/** Values substituted into `{placeholder}` tokens; `count` is matched against plural categories. */
export type TranslationValues = Record<string, string | number>;

/**
 * CLDR plural categories as reported by `Intl.PluralRules#select`.
 *
 * Catalogs only have to define `other` (the required fallback); every other
 * category is optional, so a language can add `zero` / `two` / `few` / `many`
 * later without a code change.
 */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** Every plural category a catalog key may define, in CLDR order. */
export const PLURAL_CATEGORIES: readonly PluralCategory[] = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
];

/** `other` is the only plural form every catalog must define. */
export const DEFAULT_PLURAL_CATEGORY: PluralCategory = "other";

/** A translator bound to a locale. */
export type Translate = (key: string, values?: TranslationValues) => string;

type MessageTree = Record<string, unknown>;

const MESSAGES: Record<Locale, MessageTree> = {
  en: en as MessageTree,
  es: es as MessageTree,
  ar: ar as MessageTree,
  he: en as MessageTree, // Hebrew falls back to English strings with RTL direction
};

/** Narrow an unknown value (e.g. a localStorage entry) to a supported locale. */
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (["en", "es", "ar", "he"] as readonly string[]).includes(value)
  );
}

/**
 * Reduce a BCP 47 tag to its lower-cased primary language subtag.
 *
 * `es-MX`, `es_419` and `ES` all collapse to `es`; script and region subtags
 * never influence which catalog is used.
 */
function primarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Match a BCP 47 language tag against the shipped catalogs (#1459).
 *
 * Only {@link SUPPORTED_LOCALES} can match, because those are the catalogs the
 * language picker can also offer. `he` is a valid {@link Locale} (RTL layout,
 * English strings) but ships no catalog, so `he-IL` is "unsupported" and
 * detection falls through to English.
 *
 * @returns The matching locale, or `undefined` when there is no catalog for it.
 *
 * @example
 * matchLocale("es-MX") // "es"
 * matchLocale("en-GB") // "en"
 * matchLocale("fr-FR") // undefined
 */
export function matchLocale(tag: string): Locale | undefined {
  const subtag = primarySubtag(tag);
  return SUPPORTED_LOCALES.find((locale) => locale === subtag);
}

/**
 * Pick the best shipped catalog for the browser's preferred languages (#1459).
 *
 * `navigator.languages` (most preferred first) is consulted before
 * `navigator.language`, and the first entry with a catalog wins — a browser set
 * to `["fr-FR", "es-MX"]` opens in Spanish. Anything unsupported, an empty or
 * missing `navigator` (SSR), or a throwing getter falls back to English.
 *
 * @param languages Optional tag list, used by tests; defaults to the browser's.
 */
export function detectBrowserLocale(languages?: readonly string[]): Locale {
  const candidates: string[] = [];

  if (languages) {
    for (const tag of languages) candidates.push(tag);
  } else if (typeof navigator !== "undefined") {
    try {
      for (const tag of navigator.languages ?? []) candidates.push(tag);
      if (navigator.language) candidates.push(navigator.language);
    } catch {
      // A hardened browser can throw on navigator access — fall back to English.
      return DEFAULT_LOCALE;
    }
  }

  for (const tag of candidates) {
    if (typeof tag !== "string" || tag === "") continue;

    const match = matchLocale(tag);
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}

/**
 * Resolve a dot-path key inside a message tree.
 *
 * @returns The message string, or `undefined` when the path is missing or does
 *          not point at a string.
 */
export function lookupMessage(
  tree: MessageTree,
  key: string
): string | undefined {
  let node: unknown = tree;

  for (const segment of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }

  return typeof node === "string" ? node : undefined;
}

/** Replace `{token}` (or `{{token}}`) placeholders; unknown tokens are left untouched. */
export function interpolate(
  template: string,
  values?: TranslationValues
): string {
  if (!values) return template;

  return template.replace(
    /\{\{?(\w+)\}\}?/g,
    (match, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name)
        ? String(values[name])
        : match
  );
}

/** Cache of `Intl.PluralRules` instances, keyed by locale. */
const PLURAL_RULES = new Map<string, Intl.PluralRules>();

function pluralRules(locale: Locale): Intl.PluralRules | null {
  if (typeof Intl === "undefined" || typeof Intl.PluralRules !== "function") {
    return null;
  }

  const cached = PLURAL_RULES.get(locale);
  if (cached) return cached;

  try {
    const rules = new Intl.PluralRules(locale);
    PLURAL_RULES.set(locale, rules);
    return rules;
  } catch {
    return null;
  }
}

/**
 * Pick the CLDR plural category for `count` in `locale`.
 *
 * Never throws: environments without `Intl.PluralRules` (or with an unknown
 * locale tag) fall back to the English one/other rule.
 */
export function selectPluralCategory(
  locale: Locale,
  count: number
): PluralCategory {
  const rules = pluralRules(locale);

  if (!rules) return count === 1 ? "one" : DEFAULT_PLURAL_CATEGORY;

  return rules.select(count) as PluralCategory;
}

/**
 * Resolve `key` against one catalog, trying the count's plural form first.
 *
 * @param tree    Catalog to search.
 * @param key     Dot-path key, e.g. `dashboard.outgoingPayments`.
 * @param count   Count driving plural selection, if any.
 * @param locale  Locale used for `Intl.PluralRules`.
 */
function resolveFromTree(
  tree: MessageTree,
  key: string,
  count: number | undefined,
  locale: Locale
): string | undefined {
  if (count !== undefined) {
    const category = selectPluralCategory(locale, count);

    for (const pluralKey of [`${key}.${category}`, `${key}.${DEFAULT_PLURAL_CATEGORY}`]) {
      const form = lookupMessage(tree, pluralKey);
      if (form !== undefined) return form;
    }
  }

  return lookupMessage(tree, key);
}

/**
 * Translate `key` for `locale`, interpolating `values`.
 *
 * When `values.count` is a number the catalog is asked for the CLDR plural
 * form of that count (`key.one`, `key.few`, `key.other`, …) before falling back
 * to a plain string at `key`.
 *
 * Fallback order per locale: plural form for the count → `other` → the plain
 * `key`; then the same again in English, then the raw key itself.
 */
export function translate(
  locale: Locale,
  key: string,
  values?: TranslationValues
): string {
  const rawCount = values?.count;
  const count = typeof rawCount === "number" ? rawCount : undefined;

  const template =
    resolveFromTree(MESSAGES[locale], key, count, locale) ??
    resolveFromTree(MESSAGES[DEFAULT_LOCALE], key, count, DEFAULT_LOCALE) ??
    key;

  return interpolate(template, values);
}

/** Bind {@link translate} to a locale, producing a `t(key)` function. */
export function createTranslator(locale: Locale): Translate {
  return (key, values) => translate(locale, key, values);
}

/**
 * Read the *explicit* locale the visitor picked, if any (#1459).
 *
 * @returns The stored locale, or `null` when the visitor has never chosen one
 *          (or when storage is unavailable). Storage failures are swallowed:
 *          a private-mode `localStorage` reads as "no choice", which lets
 *          browser detection take over instead of breaking the page.
 */
export function getLocaleOverride(): Locale | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    // localStorage can throw in private browsing modes — degrade to detection.
    return null;
  }
}

/** Read the persisted locale, defaulting to English. */
export function getStoredLocale(): Locale {
  return getLocaleOverride() ?? DEFAULT_LOCALE;
}

/** Persist the chosen locale so it survives a reload. */
export function setStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage being unavailable must never break the UI.
  }
}

/**
 * Forget the explicit choice so browser detection applies again (#1459).
 *
 * Safe to call when storage is unavailable — the caller then simply keeps the
 * detected locale.
 */
export function clearLocaleOverride(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // Storage being unavailable must never break the UI.
  }
}

/**
 * Resolve the locale the app should boot with (#1459).
 *
 * Precedence: an explicit manual choice → the browser's preferred language →
 * English. Detection therefore never overrides a user's selection, and a
 * first-time visitor gets their browser language instead of English.
 */
export function resolveInitialLocale(): Locale {
  return getLocaleOverride() ?? detectBrowserLocale();
}

/** Keep `<html lang>` and `<html dir>` in sync so screen readers and layout respect RTL locales (#1318). */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr";
}
