/**
 * lib/receipts.ts
 * On-chain payment receipts: minting via the connected wallet, listing the
 * caller's minted receipts, and turning contract failures into readable text.
 *
 * Contract entry points (contracts/stellar-micropay-contract/src/lib.rs):
 *   mint_receipt(from, to, amount, memo) -> u32
 *   get_receipt_count(payer) -> u32
 *   get_receipt(payer, index) -> ReceiptMetadata
 */

import {
  buildReceiptMintTransaction,
  getReceipt,
  getReceiptCount,
  submitTransaction,
  OnChainReceipt,
  PaymentRecord,
  STELLAR_STROOPS_PER_XLM,
} from "@/lib/stellar";
import { signTransactionWithWallet, WalletType } from "@/lib/wallet";
import { extractHorizonResultCodes, formatHorizonResultCodes } from "@/lib/horizonErrors";

export type { OnChainReceipt } from "@/lib/stellar";

const MINTED_RECEIPTS_STORAGE_KEY = "stellar-micropay:minted-receipts";

/**
 * A payment is eligible for a receipt when the connected account paid it in
 * XLM: `mint_receipt` requires the payer's auth (so only the sender can mint)
 * and rejects non-positive amounts.
 */
export function isReceiptEligible(payment: PaymentRecord, publicKey: string): boolean {
  if (payment.type !== "sent" || payment.from !== publicKey) return false;
  if (payment.asset !== "XLM") return false;
  const amount = parseFloat(payment.amount);
  return Number.isFinite(amount) && amount > 0;
}

/** Convert a stroop amount string from the contract into an XLM string. */
export function stroopsToXlm(stroops: string): string {
  const value = BigInt(stroops);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const per = BigInt(STELLAR_STROOPS_PER_XLM);
  const whole = abs / per;
  const fraction = (abs % per).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/**
 * Map raw contract / RPC / wallet errors to something a user can act on.
 * Soroban simulation errors arrive as long host-error dumps, so we match on
 * the stable pieces (panic messages and error codes) instead of showing them.
 */
export function describeReceiptError(err: unknown): string {
  const horizonCodes = extractHorizonResultCodes(err);
  if (horizonCodes) return formatHorizonResultCodes(horizonCodes);

  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";

  if (/Receipt not found|index out of (range|bounds)/i.test(message)) {
    return "That receipt doesn't exist on-chain — the index is out of range for this account.";
  }
  if (/Receipt amount must be positive/i.test(message)) {
    return "Receipts can only be minted for payments with a positive amount.";
  }
  if (/Error\(Contract, #2\)|Frozen/i.test(message)) {
    return "The receipts contract is temporarily frozen. Try again later.";
  }
  if (/rejected by the user|User declined|rejected/i.test(message)) {
    return "Signing was cancelled in your wallet, so no receipt was minted.";
  }
  if (/Error\(Auth|require_auth|InvalidAction|not authorized|unauthorized/i.test(message)) {
    return "Authorization failed: only the payer's connected wallet can mint a receipt for this payment.";
  }
  if (/Contract ID is not configured/i.test(message)) {
    return "Receipts are unavailable: no contract ID is configured for this network.";
  }
  if (/Signing failed|Freighter|wallet/i.test(message)) {
    return `Wallet signing failed. ${message}`.trim();
  }
  return message ? `Receipt request failed: ${message}` : "Receipt request failed for an unknown reason.";
}

/** Locally remembered tx hash → receipt index, so the list can show "Minted". */
export function loadMintedReceiptHashes(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MINTED_RECEIPTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function rememberMintedReceipt(txHash: string, index: number): void {
  try {
    const next = { ...loadMintedReceiptHashes(), [txHash]: index };
    localStorage.setItem(MINTED_RECEIPTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Only a display convenience; the receipt itself lives on-chain.
  }
}

/**
 * Build, sign with the connected wallet, and submit a `mint_receipt` call for
 * `payment`. Returns the submitted transaction hash and the receipt index the
 * contract assigned (the payer's receipt count before the mint).
 */
export async function mintReceiptForPayment(
  payment: PaymentRecord,
  publicKey: string,
  walletType: WalletType = "freighter"
): Promise<{ hash: string; index: number }> {
  if (!isReceiptEligible(payment, publicKey)) {
    throw new Error("Only XLM payments you sent can have a receipt minted.");
  }

  const index = await getReceiptCount(publicKey);
  const tx = await buildReceiptMintTransaction({
    fromPublicKey: publicKey,
    toPublicKey: payment.to,
    amount: payment.amount,
    memo: payment.memo,
  });

  const { signedXDR, error } = await signTransactionWithWallet(tx.toXDR(), walletType);
  if (error || !signedXDR) {
    throw new Error(error || "Signing failed: wallet returned no signature.");
  }

  const result = await submitTransaction(signedXDR);
  rememberMintedReceipt(payment.transactionHash, index);
  return { hash: result.hash, index };
}

/** Fetch every receipt minted by `payer`, newest first. */
export async function fetchMintedReceipts(payer: string): Promise<OnChainReceipt[]> {
  const count = await getReceiptCount(payer);
  const indexes = Array.from({ length: count }, (_, i) => count - 1 - i);
  return Promise.all(indexes.map((index) => getReceipt(payer, index)));
}
