/**
 * __tests__/ReceiptsList.test.tsx
 * Receipts view: metadata rendering, empty/error states, and print action.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("@/lib/receipts", () => ({
  ...jest.requireActual("@/lib/receipts"),
  fetchMintedReceipts: jest.fn(),
}));

import ReceiptsList from "@/components/ReceiptsList";
import { fetchMintedReceipts, type OnChainReceipt } from "@/lib/receipts";

const PAYER = "GPAYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const PAYEE = "GPAYEEBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function receipt(overrides: Partial<OnChainReceipt> = {}): OnChainReceipt {
  return {
    index: 0,
    from: PAYER,
    to: PAYEE,
    amountStroops: "125000000",
    timestamp: 1_790_000_000,
    memo: "rent",
    ledger: 4242,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("ReceiptsList", () => {
  it("lists minted receipts with their metadata", async () => {
    (fetchMintedReceipts as jest.Mock).mockResolvedValue([
      receipt({ index: 1, memo: "coffee", amountStroops: "5000000", ledger: 99 }),
      receipt(),
    ]);

    render(<ReceiptsList publicKey={PAYER} />);

    expect(await screen.findByText("Receipt #1")).toBeInTheDocument();
    expect(screen.getByText("Receipt #0")).toBeInTheDocument();
    expect(screen.getByText("0.5000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("12.5000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("coffee")).toBeInTheDocument();
    expect(screen.getByText("4242")).toBeInTheDocument();
    expect(fetchMintedReceipts).toHaveBeenCalledWith(PAYER);
  });

  it("shows an empty state when nothing has been minted", async () => {
    (fetchMintedReceipts as jest.Mock).mockResolvedValue([]);
    render(<ReceiptsList publicKey={PAYER} />);
    expect(await screen.findByText("No receipts minted yet.")).toBeInTheDocument();
  });

  it("surfaces contract errors readably and can retry", async () => {
    (fetchMintedReceipts as jest.Mock)
      .mockRejectedValueOnce(new Error('HostError: Error(WasmVm, InvalidAction) "Receipt not found"'))
      .mockResolvedValueOnce([receipt()]);

    render(<ReceiptsList publicKey={PAYER} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/index is out of range/i);
    expect(alert).not.toHaveTextContent(/HostError/);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Receipt #0")).toBeInTheDocument();
  });

  it("calls onPrintReceipt with the chosen receipt", async () => {
    const onPrint = jest.fn();
    const r = receipt({ index: 2 });
    (fetchMintedReceipts as jest.Mock).mockResolvedValue([r]);

    render(<ReceiptsList publicKey={PAYER} onPrintReceipt={onPrint} />);

    fireEvent.click(await screen.findByRole("button", { name: "Print receipt #2" }));
    expect(onPrint).toHaveBeenCalledWith(r);
  });

  it("refetches when refreshKey changes", async () => {
    (fetchMintedReceipts as jest.Mock).mockResolvedValue([]);
    const { rerender } = render(<ReceiptsList publicKey={PAYER} refreshKey={0} />);
    await waitFor(() => expect(fetchMintedReceipts).toHaveBeenCalledTimes(1));

    rerender(<ReceiptsList publicKey={PAYER} refreshKey={1} />);
    await waitFor(() => expect(fetchMintedReceipts).toHaveBeenCalledTimes(2));
  });
});
