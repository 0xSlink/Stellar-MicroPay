/**
 * __tests__/TransactionList-receipts.test.tsx
 * Mint-receipt and print actions on transaction rows.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import TransactionList from "@/components/TransactionList";
import type { PaymentRecord } from "@/lib/stellar";

jest.mock("next/router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, isReady: false }),
}));

jest.mock("@/lib/stellar", () => ({
  ...jest.requireActual("@/lib/stellar"),
  getPaymentHistory: jest.fn(),
}));

import { getPaymentHistory } from "@/lib/stellar";

const ME = "GMEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER = "GOTHERBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

const sent: PaymentRecord = {
  id: "sent-1",
  type: "sent",
  amount: "5.0000000",
  asset: "XLM",
  from: ME,
  to: OTHER,
  createdAt: new Date().toISOString(),
  transactionHash: "hash-sent",
  pagingToken: "pt1",
};

const received: PaymentRecord = {
  ...sent,
  id: "recv-1",
  type: "received",
  from: OTHER,
  to: ME,
  transactionHash: "hash-recv",
  pagingToken: "pt2",
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  (getPaymentHistory as jest.Mock).mockResolvedValue({ records: [sent, received], hasMore: false });
});

describe("TransactionList receipt actions", () => {
  it("offers Mint receipt only on payments the account sent", async () => {
    const onMint = jest.fn();
    render(<TransactionList publicKey={ME} onMintReceipt={onMint} />);

    const buttons = await screen.findAllByRole("button", { name: /Mint receipt for payment/ });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);
    expect(onMint).toHaveBeenCalledWith(expect.objectContaining({ transactionHash: "hash-sent" }));
  });

  it("does not render mint actions without a handler", async () => {
    render(<TransactionList publicKey={ME} />);
    await screen.findAllByText(/Sent to|Received from/);
    expect(screen.queryByRole("button", { name: /Mint receipt/ })).not.toBeInTheDocument();
  });

  it("shows a minting state and disables other mints while signing", async () => {
    render(
      <TransactionList publicKey={ME} onMintReceipt={jest.fn()} mintingReceiptHash="hash-sent" />
    );

    const button = await screen.findByRole("button", { name: /Mint receipt for payment/ });
    expect(button).toHaveTextContent("Minting…");
    expect(button).toBeDisabled();
  });

  it("shows the receipt number instead of the button once minted", async () => {
    render(
      <TransactionList
        publicKey={ME}
        onMintReceipt={jest.fn()}
        mintedReceiptHashes={{ "hash-sent": 4 }}
      />
    );

    expect(await screen.findByTestId("receipt-minted-sent-1")).toHaveTextContent("Receipt #4");
    expect(screen.queryByRole("button", { name: /Mint receipt/ })).not.toBeInTheDocument();
  });

  it("renders a print button per row that calls onPrintReceipt", async () => {
    const onPrint = jest.fn();
    render(<TransactionList publicKey={ME} onPrintReceipt={onPrint} />);

    const printButtons = await screen.findAllByRole("button", { name: /Print receipt for transaction/ });
    expect(printButtons).toHaveLength(2);

    fireEvent.click(printButtons[1]);
    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ transactionHash: "hash-recv" }));
  });
});
