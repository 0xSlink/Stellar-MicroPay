/**
 * pages/transactions.tsx
 * Full transaction history page with UX cursor fixes.
 */

import Head from "next/head";
import Link from "next/link";
import WalletConnect from "@/components/WalletConnect";
import TransactionList, {
  filterPayments,
  TransactionDirectionFilter,
  TransactionFilters,
} from "@/components/TransactionList";
import { fetchAllPayments, getNetwork, shortenAddress, PaymentRecord } from "@/lib/stellar";
import { exportToCSV, exportToJSON } from "@/utils/format";
import { formatAsset, formatDate } from "@/utils/intlFormatters";
import { useWallet } from "@/lib/useWallet";
import ReceiptsList, { receiptDate } from "@/components/ReceiptsList";
import {
  describeReceiptError,
  loadMintedReceiptHashes,
  mintReceiptForPayment,
  stroopsToXlm,
  OnChainReceipt,
} from "@/lib/receipts";
import { loadAllPaymentNotes } from "@/lib/usePaymentNotes";
import { useTranslation } from "@/contexts/I18nContext";
import { useCallback, useEffect, useMemo, useState } from "react";

const TRANSACTION_FILTERS_STORAGE_KEY = "stellar-micropay:transaction-filters";

const DIRECTION_FILTERS: Array<{
  label: string;
  value: TransactionDirectionFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Sent", value: "sent" },
  { label: "Received", value: "received" },
];

type TransactionsView = "history" | "receipts";

interface PrintableReceipt {
  title: string;
  date: string;
  subtitle: string;
  rows: Array<{ label: string; value: string; mono?: boolean }>;
}

function isDirectionFilter(value: unknown): value is TransactionDirectionFilter {
  return value === "all" || value === "sent" || value === "received";
}

export default function Transactions() {
  const { t } = useTranslation();
  const { publicKey } = useWallet();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportCount, setExportCount] = useState(0);
  const [exportFormat, setExportFormat] = useState<"csv" | "json" | null>(null);
  const [directionFilter, setDirectionFilter] =
    useState<TransactionDirectionFilter>("all");
  const [minimumAmount, setMinimumAmount] = useState("");
  const [memoSearch, setMemoSearch] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);
  const [printableReceipt, setPrintableReceipt] = useState<PrintableReceipt | null>(null);
  const [view, setView] = useState<TransactionsView>("history");
  const [mintingReceiptHash, setMintingReceiptHash] = useState<string | null>(null);
  const [mintedReceiptHashes, setMintedReceiptHashes] = useState<Record<string, number>>({});
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintSuccess, setMintSuccess] = useState<string | null>(null);
  const [receiptsRefreshKey, setReceiptsRefreshKey] = useState(0);

  const transactionFilters = useMemo<TransactionFilters>(
    () => ({
      direction: directionFilter,
      minAmount: minimumAmount,
      memoSearch: memoSearch,
    }),
    [directionFilter, minimumAmount, memoSearch]
  );

  const filteredPayments = useMemo(
    () => filterPayments(payments, transactionFilters),
    [payments, transactionFilters]
  );

  const activeFilterCount =
    (directionFilter !== "all" ? 1 : 0) +
    (minimumAmount.trim() !== "" ? 1 : 0) +
    (memoSearch.trim() !== "" ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const exportPayments = filteredPayments;
  const networkLabel = getNetwork() === "mainnet" ? "Mainnet" : "Testnet";

  // Receives the latest payments array from the list whenever it changes
  const handlePaymentsChange = useCallback((records: PaymentRecord[]) => {
    setPayments(records);
  }, []);

  useEffect(() => {
    try {
      const savedFilters = sessionStorage.getItem(TRANSACTION_FILTERS_STORAGE_KEY);
      if (!savedFilters) return;

      const parsed = JSON.parse(savedFilters) as Partial<TransactionFilters>;
      if (isDirectionFilter(parsed.direction)) {
        setDirectionFilter(parsed.direction);
      }
      if (typeof parsed.minAmount === "string") {
        setMinimumAmount(parsed.minAmount);
      }
      if (typeof parsed.memoSearch === "string") {
        setMemoSearch(parsed.memoSearch);
      }
    } catch {
      try {
        sessionStorage.removeItem(TRANSACTION_FILTERS_STORAGE_KEY);
      } catch {
        // Ignore storage cleanup failures; the filters still fall back safely.
      }
    } finally {
      setFiltersReady(true);
    }
  }, []);

  useEffect(() => {
    if (!filtersReady) return;

    try {
      sessionStorage.setItem(
        TRANSACTION_FILTERS_STORAGE_KEY,
        JSON.stringify(transactionFilters)
      );
    } catch {
      // Session persistence is a convenience; filtering should continue without it.
    }
  }, [filtersReady, transactionFilters]);

  const handleResetFilters = () => {
    setDirectionFilter("all");
    setMinimumAmount("");
    setMemoSearch("");
  };

  const handleExport = async (format: "csv" | "json") => {
    if (!publicKey) return;
    setExporting(true);
    setExportFormat(format);
    setExportCount(0);
    try {
      const allPayments = await fetchAllPayments(publicKey, {
        onProgress: ({ fetchedRecords }) => setExportCount(fetchedRecords),
      });
      if (allPayments.length === 0) return;

      if (format === "csv") {
        // Include private notes in CSV export (Issue #1189)
        const notes = loadAllPaymentNotes();
        exportToCSV(allPayments, notes);
      } else {
        exportToJSON(allPayments);
      }
    } finally {
      // Small delay so the button flash feels intentional
      setTimeout(() => {
        setExporting(false);
        setExportFormat(null);
      }, 800);
    }
  };

  useEffect(() => {
    setMintedReceiptHashes(loadMintedReceiptHashes());
  }, []);

  const handlePrintReceipt = useCallback(
    (payment: PaymentRecord) => {
      setPrintableReceipt({
        title: "Payment Receipt",
        date: formatDate(payment.createdAt),
        subtitle: payment.type === "sent" ? "Sent" : "Received",
        rows: [
          { label: "Date", value: formatDate(payment.createdAt) },
          { label: "Amount", value: formatAsset(payment.amount, payment.asset) },
          { label: "Sender", value: payment.from, mono: true },
          { label: "Recipient", value: payment.to, mono: true },
          { label: "Memo", value: payment.memo || "-" },
          { label: "Transaction Hash", value: payment.transactionHash, mono: true },
          { label: "Network", value: networkLabel },
        ],
      });
    },
    [networkLabel]
  );

  const handlePrintOnChainReceipt = useCallback(
    (receipt: OnChainReceipt) => {
      setPrintableReceipt({
        title: `On-chain Receipt #${receipt.index}`,
        date: receiptDate(receipt),
        subtitle: "Minted",
        rows: [
          { label: "Receipt", value: `#${receipt.index}` },
          { label: "Minted", value: receiptDate(receipt) },
          { label: "Amount", value: `${stroopsToXlm(receipt.amountStroops)} XLM` },
          { label: "Payer", value: receipt.from, mono: true },
          { label: "Payee", value: receipt.to, mono: true },
          { label: "Memo", value: receipt.memo || "-" },
          { label: "Ledger", value: String(receipt.ledger) },
          { label: "Network", value: networkLabel },
        ],
      });
    },
    [networkLabel]
  );

  const handleMintReceipt = useCallback(
    async (payment: PaymentRecord) => {
      if (!publicKey) return;
      setMintingReceiptHash(payment.transactionHash);
      setMintError(null);
      setMintSuccess(null);
      try {
        const { index } = await mintReceiptForPayment(payment, publicKey);
        setMintedReceiptHashes((prev) => ({ ...prev, [payment.transactionHash]: index }));
        setMintSuccess(`Receipt #${index} minted on-chain.`);
        setReceiptsRefreshKey((n) => n + 1);
      } catch (err) {
        setMintError(describeReceiptError(err));
      } finally {
        setMintingReceiptHash(null);
      }
    },
    [publicKey]
  );

  useEffect(() => {
    if (!printableReceipt) return;

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    const cleanup = () => {
      document.body.classList.remove("receipt-printing");
      setPrintableReceipt(null);
    };

    const handleAfterPrint = () => {
      if (cancelled) return;
      cleanup();
    };

    document.body.classList.add("receipt-printing");
    window.addEventListener("afterprint", handleAfterPrint);

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          window.print();
        }
      });
    });

    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", handleAfterPrint);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      document.body.classList.remove("receipt-printing");
    };
  }, [printableReceipt]);

  if (!publicKey) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 cursor-default select-none">
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl font-bold text-white mb-3">
            {`Transaction History`}
          </h1>
          <p className="text-slate-400">{`Connect your wallet to view your payments`}</p>
        </div>
        <WalletConnect />
      </div>
    );
  }

  return (
    // Added cursor-default and select-none to the main page wrapper
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in cursor-default select-none">
      <Head>
        <title>{t("pages.transactions.title")}</title>
        <meta name="description" content="View your full Stellar transaction history, export data as CSV or JSON, and print payment receipts. Secure and transparent." />
        <link rel="canonical" href="https://stellar-micropay.vercel.app/transactions" />
      </Head>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-white mb-1">
            {`Transaction History`}
          </h1>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>{`Account:`}</span>
            {/* Added select-text and cursor-text so the address pill remains functional */}
            <span className="address-pill select-text cursor-text">{shortenAddress(publicKey)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-1">
          {/* Download CSV */}
          <button
            onClick={() => void handleExport("csv")}
            disabled={exportPayments.length === 0 || exporting || !publicKey}
            title={
              exportPayments.length === 0
                ? "No transactions to export"
                : "Export full history as CSV"
            }
            className={[
              "inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg",
              "border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-400/60",
              exportPayments.length === 0 || exporting
                ? "border-white/10 text-slate-600 cursor-not-allowed"
                : "border-stellar-500/30 text-stellar-400 hover:bg-stellar-500/10 hover:border-stellar-500/50 cursor-pointer",
            ].join(" ")}
          >
            {exporting && exportFormat === "csv" ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-stellar-400 border-t-transparent rounded-full animate-spin" />
                {`Exporting…`}
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                {`Download CSV`}
              </>
            )}
          </button>

          <button
            onClick={() => void handleExport("json")}
            disabled={exportPayments.length === 0 || exporting || !publicKey}
            title={
              exportPayments.length === 0
                ? "No transactions to export"
                : "Export full history as JSON"
            }
            className={[
              "inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg",
              "border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-400/60",
              exportPayments.length === 0 || exporting
                ? "border-white/10 text-slate-600 cursor-not-allowed"
                : "border-stellar-500/30 text-stellar-400 hover:bg-stellar-500/10 hover:border-stellar-500/50 cursor-pointer",
            ].join(" ")}
          >
            {exporting && exportFormat === "json" ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-stellar-400 border-t-transparent rounded-full animate-spin" />
                {`Exporting…`}
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17h6m-6-4h6m-6-4h6M6.75 3h10.5A2.25 2.25 0 0119.5 5.25v13.5A2.25 2.25 0 0117.25 21H6.75A2.25 2.25 0 014.5 18.75V5.25A2.25 2.25 0 016.75 3z" />
                </svg>
                {`Download JSON`}
              </>
            )}
          </button>

          <Link href="/dashboard" className="btn-secondary text-sm py-2 px-4 cursor-pointer">
            {`← Dashboard`}
          </Link>
        </div>
      </div>

      {exporting && (
        <p className="mb-4 text-xs text-slate-400">
          {`Preparing full account history export… ${exportCount} records processed.`}
        </p>
      )}

      {/* Export hint */}
      <div className="mb-5 p-3 rounded-xl bg-stellar-500/5 border border-stellar-500/15 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {`Showing your transaction history. Click "Load more" to view older transactions.`}
        </p>
        <a
          href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-stellar-400 hover:text-stellar-300 transition-colors whitespace-nowrap ml-4 cursor-pointer"
        >
          {`Full history →`}
        </a>
      </div>

      {/* View switcher */}
      <div
        role="tablist"
        aria-label="Transactions view"
        className="mb-5 inline-flex rounded-xl border border-white/10 bg-cosmos-900/70 p-1"
      >
        {([
          { label: "History", value: "history" },
          { label: "Receipts", value: "receipts" },
        ] as Array<{ label: string; value: TransactionsView }>).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={view === option.value}
            onClick={() => setView(option.value)}
            className={[
              "min-w-24 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-400/60 cursor-pointer",
              view === option.value
                ? "bg-stellar-500/20 text-stellar-200"
                : "text-slate-500 hover:text-slate-200",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mintError && (
        <div role="alert" className="mb-4 p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start justify-between gap-3">
          <p className="text-sm text-red-300">{mintError}</p>
          <button
            type="button"
            onClick={() => setMintError(null)}
            className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            aria-label="Dismiss receipt error"
          >
            ×
          </button>
        </div>
      )}

      {mintSuccess && (
        <div role="status" className="mb-4 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between gap-3">
          <p className="text-sm text-emerald-300">{mintSuccess}</p>
          <button
            type="button"
            onClick={() => setView("receipts")}
            className="text-xs font-medium text-stellar-400 hover:text-stellar-300 cursor-pointer"
          >
            View receipts →
          </button>
        </div>
      )}

      {view === "receipts" ? (
        <div className="select-text">
          <ReceiptsList
            publicKey={publicKey}
            refreshKey={receiptsRefreshKey}
            onPrintReceipt={handlePrintOnChainReceipt}
          />
        </div>
      ) : (
      <>
      {/* Filters */}
      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 select-text">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Filters
              </span>
              <span className="rounded-full border border-stellar-500/25 bg-stellar-500/10 px-2 py-0.5 text-[11px] font-medium text-stellar-300">
                {activeFilterCount} active
              </span>
            </div>

            <div
              role="group"
              aria-label="Transaction direction"
              className="inline-flex rounded-xl border border-white/10 bg-cosmos-900/70 p-1"
            >
              {DIRECTION_FILTERS.map((option) => {
                const isActive = directionFilter === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setDirectionFilter(option.value)}
                    className={[
                      "min-w-20 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-400/60",
                      isActive
                        ? "bg-stellar-500/20 text-stellar-200"
                        : "text-slate-500 hover:text-slate-200",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full sm:w-56">
            <label htmlFor="minimum-amount" className="label mb-2">
              Minimum Amount
            </label>
            <div className="relative">
              <input
                id="minimum-amount"
                type="number"
                min="0"
                step="0.0000001"
                inputMode="decimal"
                value={minimumAmount}
                onChange={(event) => setMinimumAmount(event.target.value)}
                placeholder="0.00"
                className="input-field py-2.5 pr-14"
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-medium text-slate-500">
                XLM
              </span>
            </div>
          </div>

          <div className="w-full sm:w-56">
            <label htmlFor="memo-search" className="label mb-2">
              Search Memo
            </label>
            <input
              id="memo-search"
              type="text"
              value={memoSearch}
              onChange={(event) => setMemoSearch(event.target.value)}
              placeholder="Filter by memo text…"
              className="input-field py-2.5"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {t("transactions.showingLoaded", {
                shown: filteredPayments.length,
                count: payments.length,
              })}
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="self-start text-xs font-medium text-stellar-400 transition-colors hover:text-stellar-300 sm:self-auto"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Transaction list - Wrapped in select-text so hashes can be copied */}
      <div className="select-text">
        <TransactionList
          publicKey={publicKey}
          limit={20}
          filters={transactionFilters}
          onPaymentsChange={handlePaymentsChange}
          onPrintReceipt={handlePrintReceipt}
          onMintReceipt={(payment) => void handleMintReceipt(payment)}
          mintingReceiptHash={mintingReceiptHash}
          mintedReceiptHashes={mintedReceiptHashes}
        />
      </div>
      </>
      )}

      <div className="receipt-print-root" aria-hidden="true">
        {printableReceipt && (
          <div className="receipt-sheet card" data-testid="receipt-print-sheet">
            <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5 mb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 mb-2">
                  Stellar MicroPay
                </p>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {printableReceipt.title}
                </h2>
                <p className="text-sm text-slate-500 mt-1">{printableReceipt.date}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Network
                </p>
                <p className="text-lg font-semibold text-slate-900">{networkLabel}</p>
                <p className="text-sm text-slate-500 capitalize">{printableReceipt.subtitle}</p>
              </div>
            </div>

            <dl className="grid gap-4 text-sm text-slate-700">
              {printableReceipt.rows.map((row) => (
                <ReceiptRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
              ))}
            </dl>

            <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
              Generated by Stellar MicroPay using browser print-to-PDF.
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body.receipt-printing {
            background: #fff !important;
            color: #0f172a !important;
          }

          body.receipt-printing * {
            visibility: hidden !important;
          }

          body.receipt-printing .receipt-print-root,
          body.receipt-printing .receipt-print-root * {
            visibility: visible !important;
          }

          body.receipt-printing .receipt-print-root {
            position: fixed !important;
            inset: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body.receipt-printing .receipt-sheet {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 20mm 18mm;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #0f172a !important;
          }

          body.receipt-printing .receipt-sheet * {
            color: inherit !important;
          }

          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}

function ReceiptRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_minmax(0,1.8fr)] gap-4 border-b border-slate-200 pb-3">
      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className={mono ? "font-mono break-all text-slate-900" : "text-slate-900 break-words"}>
        {value}
      </dd>
    </div>
  );
}
