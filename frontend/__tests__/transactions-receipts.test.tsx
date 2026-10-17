/**
 * __tests__/transactions-receipts.test.tsx
 * Transactions page: minting receipts via the wallet, readable contract
 * errors, and printing on-chain receipts from the Receipts view.
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PaymentRecord } from "@/lib/stellar";

const ME = "GMEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER = "GOTHERBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

jest.mock("next/router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, isReady: false, pathname: "/transactions" }),
}));

jest.mock("@/lib/useWallet", () => ({
  useWallet: () => ({ publicKey: ME }),
}));

jest.mock("@/lib/stellar", () => ({
  ...jest.requireActual("@/lib/stellar"),
  getPaymentHistory: jest.fn(),
}));

jest.mock("@/lib/receipts", () => ({
  ...jest.requireActual("@/lib/receipts"),
  mintReceiptForPayment: jest.fn(),
  fetchMintedReceipts: jest.fn(),
}));

import Transactions from "@/pages/transactions";
import { getPaymentHistory } from "@/lib/stellar";
import { fetchMintedReceipts, mintReceiptForPayment } from "@/lib/receipts";

const sent: PaymentRecord = {
  id: "sent-1",
  type: "sent",
  amount: "5.0000000",
  asset: "XLM",
  from: ME,
  to: OTHER,
  memo: "rent",
  createdAt: "2026-10-01T12:00:00Z",
  transactionHash: "hash-sent",
  pagingToken: "pt1",
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.print = jest.fn();
  (getPaymentHistory as jest.Mock).mockResolvedValue({ records: [sent], hasMore: false });
  (fetchMintedReceipts as jest.Mock).mockResolvedValue([]);
});

describe("Transactions page receipts", () => {
  it("mints a receipt for a sent payment and marks the row", async () => {
    (mintReceiptForPayment as jest.Mock).mockResolvedValue({ hash: "minthash", index: 3 });

    render(<Transactions />);
    fireEvent.click(await screen.findByRole("button", { name: /Mint receipt for payment/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("Receipt #3 minted on-chain.");
    expect(mintReceiptForPayment).toHaveBeenCalledWith(
      expect.objectContaining({ transactionHash: "hash-sent" }),
      ME
    );
    expect(screen.getByTestId("receipt-minted-sent-1")).toHaveTextContent("Receipt #3");
  });

  it("surfaces an auth failure from the contract readably", async () => {
    (mintReceiptForPayment as jest.Mock).mockRejectedValue(
      new Error("HostError: Error(Auth, InvalidAction)")
    );

    render(<Transactions />);
    fireEvent.click(await screen.findByRole("button", { name: /Mint receipt for payment/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/only the payer's connected wallet can mint/i);
    expect(alert).not.toHaveTextContent("HostError");
    // Button is usable again after the failure.
    expect(screen.getByRole("button", { name: /Mint receipt for payment/ })).not.toBeDisabled();
  });

  it("lists minted receipts and prints one with the receipt sheet", async () => {
    (fetchMintedReceipts as jest.Mock).mockResolvedValue([
      {
        index: 0,
        from: ME,
        to: OTHER,
        amountStroops: "50000000",
        timestamp: 1_790_000_000,
        memo: "rent",
        ledger: 777,
      },
    ]);

    render(<Transactions />);
    fireEvent.click(screen.getByRole("tab", { name: "Receipts" }));

    fireEvent.click(await screen.findByRole("button", { name: "Print receipt #0" }));

    const sheet = await screen.findByTestId("receipt-print-sheet");
    expect(within(sheet).getByText("On-chain Receipt #0")).toBeInTheDocument();
    expect(within(sheet).getByText("5.0000000 XLM")).toBeInTheDocument();
    expect(within(sheet).getByText("777")).toBeInTheDocument();
    expect(document.body.classList.contains("receipt-printing")).toBe(true);
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    await waitFor(() => expect(screen.queryByTestId("receipt-print-sheet")).not.toBeInTheDocument());
    expect(document.body.classList.contains("receipt-printing")).toBe(false);
  });

  it("prints a Horizon payment receipt from the history row", async () => {
    render(<Transactions />);
    fireEvent.click(await screen.findByRole("button", { name: /Print receipt for transaction/ }));

    const sheet = await screen.findByTestId("receipt-print-sheet");
    expect(within(sheet).getByText("Payment Receipt")).toBeInTheDocument();
    expect(within(sheet).getByText("hash-sent")).toBeInTheDocument();
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
  });
});
