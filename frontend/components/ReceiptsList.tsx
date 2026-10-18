/**
 * components/ReceiptsList.tsx
 * Lists the on-chain payment receipts minted by the connected account.
 */

import { useCallback, useEffect, useState } from "react";
import { shortenAddress } from "@/lib/stellar";
import {
  describeReceiptError,
  fetchMintedReceipts,
  stroopsToXlm,
  OnChainReceipt,
} from "@/lib/receipts";
import { formatDate } from "@/utils/intlFormatters";

interface ReceiptsListProps {
  publicKey: string;
  /** Bump to force a refetch, e.g. after a successful mint. */
  refreshKey?: number;
  onPrintReceipt?: (receipt: OnChainReceipt) => void;
}

export function receiptDate(receipt: OnChainReceipt): string {
  return formatDate(new Date(receipt.timestamp * 1000).toISOString());
}

export default function ReceiptsList({ publicKey, refreshKey = 0, onPrintReceipt }: ReceiptsListProps) {
  const [receipts, setReceipts] = useState<OnChainReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMintedReceipts(publicKey)
      .then((records) => {
        if (!cancelled) setReceipts(records);
      })
      .catch((err) => {
        if (!cancelled) setError(describeReceiptError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [publicKey, refreshKey, reloadToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-10" aria-live="polite" aria-label="Loading receipts">
        <div className="w-6 h-6 border-2 border-stellar-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-300">
        <p>{error}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 text-xs font-medium text-stellar-400 hover:text-stellar-300 cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-400">
        <p>No receipts minted yet.</p>
        <p className="mt-1 text-xs text-slate-500">
          Use &ldquo;Mint receipt&rdquo; on a payment you sent to record proof of payment on-chain.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Minted receipts">
      {receipts.map((receipt) => (
        <li
          key={receipt.index}
          data-testid={`receipt-${receipt.index}`}
          className="p-4 rounded-xl bg-white/3 border border-white/5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">
                {`Receipt #${receipt.index}`}
                <span className="ml-2 text-xs font-normal text-slate-500">{receiptDate(receipt)}</span>
              </p>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">To</dt>
                <dd className="font-mono text-slate-300 truncate" title={receipt.to}>
                  {shortenAddress(receipt.to, 6)}
                </dd>
                <dt className="text-slate-500">Memo</dt>
                <dd className="text-slate-300 break-words">{receipt.memo || "-"}</dd>
                <dt className="text-slate-500">Ledger</dt>
                <dd className="text-slate-300">{receipt.ledger}</dd>
              </dl>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="text-sm font-mono font-medium text-slate-100">
                {`${stroopsToXlm(receipt.amountStroops)} XLM`}
              </span>
              {onPrintReceipt && (
                <button
                  type="button"
                  onClick={() => onPrintReceipt(receipt)}
                  className="text-xs font-medium text-stellar-400 hover:text-stellar-300 bg-stellar-500/10 hover:bg-stellar-500/20 px-2 py-1 rounded cursor-pointer"
                  aria-label={`Print receipt #${receipt.index}`}
                >
                  Print
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
