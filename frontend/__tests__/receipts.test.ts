/**
 * __tests__/receipts.test.ts
 * On-chain receipt helpers: eligibility, error mapping, minting and listing.
 */

jest.mock("@/lib/stellar", () => ({
  ...jest.requireActual("@/lib/stellar"),
  buildReceiptMintTransaction: jest.fn(),
  getReceipt: jest.fn(),
  getReceiptCount: jest.fn(),
  submitTransaction: jest.fn(),
}));

jest.mock("@/lib/wallet", () => ({
  signTransactionWithWallet: jest.fn(),
}));

import {
  buildReceiptMintTransaction,
  getReceipt,
  getReceiptCount,
  submitTransaction,
  toReceiptMemoSymbol,
  type PaymentRecord,
} from "@/lib/stellar";
import { signTransactionWithWallet } from "@/lib/wallet";
import {
  describeReceiptError,
  fetchMintedReceipts,
  isReceiptEligible,
  loadMintedReceiptHashes,
  mintReceiptForPayment,
  stroopsToXlm,
} from "@/lib/receipts";

const ME = "GME";
const PAYEE = "GPAYEE";

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "op1",
    type: "sent",
    amount: "12.5000000",
    asset: "XLM",
    from: ME,
    to: PAYEE,
    memo: "rent",
    createdAt: "2026-10-01T00:00:00Z",
    transactionHash: "txhash1",
    pagingToken: "pt1",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe("isReceiptEligible", () => {
  it("accepts XLM payments the connected account sent", () => {
    expect(isReceiptEligible(payment(), ME)).toBe(true);
  });

  it.each([
    ["received payments", payment({ type: "received", from: PAYEE, to: ME })],
    ["payments sent by another account", payment({ from: "GOTHER" })],
    ["non-XLM assets", payment({ asset: "USDC" })],
    ["zero amounts", payment({ amount: "0" })],
  ])("rejects %s", (_label, record) => {
    expect(isReceiptEligible(record, ME)).toBe(false);
  });
});

describe("stroopsToXlm", () => {
  it("formats stroops with 7 decimal places", () => {
    expect(stroopsToXlm("125000000")).toBe("12.5000000");
    expect(stroopsToXlm("1")).toBe("0.0000001");
  });
});

describe("toReceiptMemoSymbol", () => {
  it("replaces characters a Soroban Symbol cannot hold and caps the length", () => {
    expect(toReceiptMemoSymbol("rent - May!")).toBe("rent___May_");
    expect(toReceiptMemoSymbol("x".repeat(40))).toHaveLength(32);
    expect(toReceiptMemoSymbol(undefined)).toBe("");
  });
});

describe("describeReceiptError", () => {
  it("explains out-of-range receipt lookups", () => {
    const err = new Error('HostError: Error(WasmVm, InvalidAction) ... "Receipt not found"');
    expect(describeReceiptError(err)).toMatch(/out of range/i);
  });

  it("explains auth failures", () => {
    const err = new Error("HostError: Error(Auth, InvalidAction) require_auth failed");
    expect(describeReceiptError(err)).toMatch(/only the payer's connected wallet/i);
  });

  it("explains a frozen contract", () => {
    expect(describeReceiptError(new Error("HostError: Error(Contract, #2)"))).toMatch(/frozen/i);
  });

  it("explains a wallet rejection", () => {
    expect(describeReceiptError(new Error("Transaction signing was rejected by the user."))).toMatch(
      /cancelled/i
    );
  });

  it("explains non-positive amounts", () => {
    expect(describeReceiptError(new Error("Receipt amount must be positive"))).toMatch(/positive amount/);
  });

  it("uses Horizon result codes when present", () => {
    const err = { response: { data: { extras: { result_codes: { transaction: "tx_insufficient_fee" } } } } };
    expect(describeReceiptError(err)).toMatch(/network fee offered was too low/i);
  });

  it("falls back to the raw message", () => {
    expect(describeReceiptError(new Error("boom"))).toBe("Receipt request failed: boom");
    expect(describeReceiptError(null)).toMatch(/unknown reason/);
  });
});

describe("mintReceiptForPayment", () => {
  it("builds, signs with the wallet, submits, and remembers the receipt", async () => {
    (getReceiptCount as jest.Mock).mockResolvedValue(3);
    (buildReceiptMintTransaction as jest.Mock).mockResolvedValue({ toXDR: () => "UNSIGNED" });
    (signTransactionWithWallet as jest.Mock).mockResolvedValue({ signedXDR: "SIGNED", error: null });
    (submitTransaction as jest.Mock).mockResolvedValue({ hash: "minthash" });

    const result = await mintReceiptForPayment(payment(), ME);

    expect(result).toEqual({ hash: "minthash", index: 3 });
    expect(buildReceiptMintTransaction).toHaveBeenCalledWith({
      fromPublicKey: ME,
      toPublicKey: PAYEE,
      amount: "12.5000000",
      memo: "rent",
    });
    expect(signTransactionWithWallet).toHaveBeenCalledWith("UNSIGNED", "freighter");
    expect(submitTransaction).toHaveBeenCalledWith("SIGNED");
    expect(loadMintedReceiptHashes()).toEqual({ txhash1: 3 });
  });

  it("throws the wallet error and does not submit when signing fails", async () => {
    (getReceiptCount as jest.Mock).mockResolvedValue(0);
    (buildReceiptMintTransaction as jest.Mock).mockResolvedValue({ toXDR: () => "UNSIGNED" });
    (signTransactionWithWallet as jest.Mock).mockResolvedValue({
      signedXDR: null,
      error: "Transaction signing was rejected by the user.",
    });

    await expect(mintReceiptForPayment(payment(), ME)).rejects.toThrow(/rejected by the user/);
    expect(submitTransaction).not.toHaveBeenCalled();
    expect(loadMintedReceiptHashes()).toEqual({});
  });

  it("refuses ineligible payments before touching the network", async () => {
    await expect(mintReceiptForPayment(payment({ type: "received" }), ME)).rejects.toThrow(
      /Only XLM payments you sent/
    );
    expect(buildReceiptMintTransaction).not.toHaveBeenCalled();
  });
});

describe("fetchMintedReceipts", () => {
  it("reads every receipt newest first", async () => {
    (getReceiptCount as jest.Mock).mockResolvedValue(2);
    (getReceipt as jest.Mock).mockImplementation(async (_payer: string, index: number) => ({ index }));

    const receipts = await fetchMintedReceipts(ME);

    expect(receipts.map((r) => r.index)).toEqual([1, 0]);
    expect(getReceipt).toHaveBeenCalledWith(ME, 0);
    expect(getReceipt).toHaveBeenCalledWith(ME, 1);
  });

  it("returns an empty list without lookups when nothing was minted", async () => {
    (getReceiptCount as jest.Mock).mockResolvedValue(0);
    await expect(fetchMintedReceipts(ME)).resolves.toEqual([]);
    expect(getReceipt).not.toHaveBeenCalled();
  });
});
