# Locale-Aware Formatting

All user-facing numbers, amounts, dates, and counts in the frontend should go
through the shared Intl-based helpers in
[`frontend/utils/intlFormatters.ts`](../frontend/utils/intlFormatters.ts)
rather than `toFixed()`, `toLocaleString('en-US')`, or hand-rolled plural
strings. They respect the user's locale and timezone, never throw on bad input,
and keep the underlying machine value exact — only the display is localized.

> **Background:** these helpers replaced ad-hoc `toFixed()` calls, English-only
> `date-fns` strings, and hard-coded `en-US` formatting. `frontend/utils/format.ts`
> was kept as a backward-compatible façade so existing call sites didn't need to
> change; new code should prefer `intlFormatters.ts` directly (see
> [`format.ts` vs `intlFormatters.ts`](#formatts-vs-intlformattersts)).

## Quick start

```tsx
import {
  formatAsset,
  formatAssetPrecise,
  formatDate,
  formatRelativeTime,
  formatForScreenReader,
  pluralize,
} from "@/utils/intlFormatters";

const PaymentRow = ({ tx }) => (
  <tr>
    <td aria-label={formatForScreenReader(tx.amount, tx.asset)}>
      {formatAssetPrecise(tx.amount, tx.asset)}
    </td>
    <td title={formatDate(tx.createdAt)}>{formatRelativeTime(tx.createdAt)}</td>
  </tr>
);

const BatchSummary = ({ count }) => (
  <p>{pluralize(count, { one: "# payment", other: "# payments" })}</p>
);
```

## Common options

Every formatter takes an optional trailing `options` object. You rarely need it
— the defaults come from the browser — but it is useful in tests and when a
specific locale or timezone must be forced.

| Option                  | Default                                   | Applies to                    |
| ----------------------- | ----------------------------------------- | ----------------------------- |
| `locale`                | `getUserLocale()` (`navigator.language`, else `en-US`) | all formatters   |
| `timezone`              | `getUserTimezone()` (browser timezone, else `UTC`) | `formatDate`, `formatDateFull` |
| `useGrouping`           | `true`                                    | number / asset formatters     |
| `preserveTrailingZeros` | `false`                                   | `formatNumber`, `formatAsset` |

`getUserLocale()` returns `en-US` during SSR (no `navigator`), so pass an
explicit `locale` if server and client output must match.

## Amounts

Precision is per asset: **XLM** and **AQUA** allow up to 7 decimals, **USDC**
up to 6, and any unknown asset falls back to 7. Asset codes are trimmed and
upper-cased.

| Function | Use for | Example (en-US) |
| --- | --- | --- |
| `formatNumber(value, asset?, opts?)` | Bare number, no asset code | `formatNumber(1234.5678)` → `1,234.5678` |
| `formatAsset(amount, asset?, opts?)` | General display; trims trailing zeros | `formatAsset(1234.56, "XLM")` → `1,234.56 XLM` |
| `formatXLM(amount, opts?)` | Shorthand for `formatAsset(amount, "XLM")` | |
| `formatAssetPrecise(amount, asset?, opts?)` | Receipts, confirmations, exact ledger values | `formatAssetPrecise(10, "XLM")` → `10.0000000 XLM` |
| `formatXLMPrecise(amount, opts?)` | Shorthand for the above with XLM | |
| `formatStroopsToXLM(stroops, opts?)` | Soroban / Horizon `i128` values (1 XLM = 10,000,000 stroops); accepts `bigint`, `string`, `number` | `formatStroopsToXLM(123456)` → `0.0123456 XLM` |
| `formatSmallAmount(amount, asset?, opts?)` | Values that may be below `0.0001` | `formatSmallAmount(0.00000123, "USDC")` → `~1.23 × 10⁻⁶ USDC` |
| `formatUSD(amount, { locale?, showApprox? })` | Fiat estimates; prefixes `≈` unless `showApprox: false` | `formatUSD(1234.56)` → `≈ $1,234.56` |

Separators follow the locale:

```ts
formatXLM(1234.5678, { locale: "en-US" }); // "1,234.5678 XLM"
formatXLM(1234.5678, { locale: "de-DE" }); // "1.234,5678 XLM"
formatXLM(1234.5678, { locale: "fr-FR" }); // "1 234,5678 XLM"
```

## Dates and times

All three accept a `Date`, ISO string, or millisecond timestamp.

| Function | Output (en-US) |
| --- | --- |
| `formatDate(date, { locale?, timezone? })` | `Jan 15, 2024, 10:30 AM` |
| `formatDateFull(date, { locale?, timezone? })` | `January 15, 2024 at 10:30:45 AM UTC` (includes seconds and timezone name) |
| `formatRelativeTime(date, { locale?, now? })` | `3 minutes ago` / `vor 3 Minuten` / `il y a 3 minutes` |

`formatRelativeTime` picks the largest sensible unit (seconds → years). Pass
`now` to make it deterministic in tests.

## Plurals

`pluralize(count, forms, { locale? })` uses `Intl.PluralRules`, so it handles
languages with more than two forms. The first `#` in the chosen form is
replaced with the count; `other` is required and used as the fallback.

```ts
pluralize(0, { zero: "no items", other: "# items" }); // "no items"
pluralize(1, { one: "# item", other: "# items" });    // "1 item"
pluralize(2, { one: "# элемент", few: "# элемента", other: "# элементов" }, { locale: "ru-RU" });
// "2 элемента"
```

Note that `zero` is matched explicitly when `count === 0`, regardless of locale.

## Accessibility

- `formatForScreenReader(amount, asset?)` → `"1234 point 5678 XLM"`. Use it as
  the `aria-label` on any element that renders a formatted amount, since
  grouping separators and superscripts read poorly aloud.
- `shortenAddress(address, chars = 4)` → `"GABC...XYZ1"`. Put the full address
  in a `title` or `aria-label` alongside it.

## Validation

Both return `null` when valid, or a user-facing error string.

```ts
validateDate("invalid");            // "Invalid date value"
validateDate(null);                 // "Date is required"
validateAmount(0, "XLM");           // "Amount must be greater than zero"
validateAmount("1.00000001", "XLM");
// "Amount cannot have more than 7 decimal places for XLM"
```

## Invalid input

Formatters never throw. Use this to decide whether you need your own guard:

| Input | Number / asset formatters | Date formatters |
| --- | --- | --- |
| `NaN`, `Infinity`, `null`, `undefined` | Formatted as `0` (e.g. `0 XLM`, `≈ $0.00`) | — |
| Unparseable date | — | Returns `String(input)` unchanged |

## `format.ts` vs `intlFormatters.ts`

`frontend/utils/format.ts` re-exports several helpers from `intlFormatters.ts`
(`formatNumber`, `formatSmallAmount`, `formatForScreenReader`, `validateDate`,
`validateAmount`, `getUserTimezone`, `formatDateFull`, and `pluralize` as
`pluralizeIntl`) and also hosts non-formatting utilities (CSV parsing/export,
clipboard). However, some functions with the **same name behave differently**
there, to stay compatible with existing callers:

| Function | `format.ts` behaviour |
| --- | --- |
| `formatDate` | `date-fns` pattern `MMM d, yyyy · HH:mm`, not localized |
| `timeAgo` | `date-fns` `formatDistanceToNow`, English only (use `formatRelativeTime` instead) |
| `formatUSD` | Always `en-US`, appends ` USD` |
| `formatXLMPrecise` | Trims trailing zeros (the opposite of the Intl version) |
| `formatAsset` | USDC fixed to 2 decimals |

For new code, import from `@/utils/intlFormatters`. Only reach for `format.ts`
when you need one of its non-formatting helpers or must match existing output.

## Testing

Tests live in `frontend/__tests__/intlFormatters.test.ts` and cover multiple
locales (en-US, de-DE, fr-FR, ru-RU), timezones, tiny amounts, plural rules,
and invalid input. When adding a formatter or changing an asset rule, add cases
there and pass an explicit `locale`/`timezone` so results don't depend on the
machine running the tests.

```bash
cd frontend && npm test -- intlFormatters
```

## Browser support

The helpers rely only on built-in `Intl` APIs. `Intl.RelativeTimeFormat`
(Chrome 71, Firefox 65, Safari 14) and `Intl.PluralRules` (Chrome 63,
Firefox 58, Safari 13) set the floor; all other APIs used are older. No
polyfills are bundled.
