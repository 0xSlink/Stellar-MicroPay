import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WalletHealthPanel from "@/components/WalletHealthPanel";
import { server } from "@/lib/stellar";

jest.mock("@/lib/stellar", () => ({
  server: { loadAccount: jest.fn() },
}));

const PUBLIC_KEY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function account(overrides: Record<string, unknown> = {}) {
  return {
    balances: [{ asset_type: "native", balance: "100.0000000" }],
    signers: [{ key: PUBLIC_KEY, weight: 1, type: "ed25519" }],
    subentry_count: 0,
    home_domain: "example.org",
    ...overrides,
  };
}

const loadAccountMock = jest.mocked(server.loadAccount);

describe("WalletHealthPanel", () => {
  beforeEach(() => {
    loadAccountMock.mockReset();
  });

  it("shows a healthy account and its calculated balance and reserve", async () => {
    loadAccountMock.mockResolvedValue(
      account({
        balances: [
          { asset_type: "native", balance: "100.0000000" },
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
            balance: "25.5000000",
          },
        ],
        subentry_count: 1,
      }) as Awaited<ReturnType<typeof server.loadAccount>>,
    );

    render(<WalletHealthPanel publicKey={PUBLIC_KEY} />);

    expect(await screen.findByText("Your account is healthy")).toBeInTheDocument();
    expect(screen.getByText("100.0000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("98.5000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("1.5 XLM locked in reserves")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText("25.5000000")).toBeInTheDocument();
    expect(screen.getByText("example.org")).toBeInTheDocument();
  });

  it("warns when spendable balance is below the component's 1 XLM threshold", async () => {
    loadAccountMock.mockResolvedValue(
      account({
        balances: [{ asset_type: "native", balance: "2.4999999" }],
        subentry_count: 1,
      }) as Awaited<ReturnType<typeof server.loadAccount>>,
    );

    render(<WalletHealthPanel publicKey={PUBLIC_KEY} />);

    expect(await screen.findByText("1 warning")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Low spendable balance — your account is close to the minimum reserve.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("0.9999999 XLM")).toBeInTheDocument();
  });

  it("does not warn at the 1 XLM spendable-balance boundary", async () => {
    loadAccountMock.mockResolvedValue(
      account({
        balances: [{ asset_type: "native", balance: "2.5000000" }],
        subentry_count: 1,
      }) as Awaited<ReturnType<typeof server.loadAccount>>,
    );

    render(<WalletHealthPanel publicKey={PUBLIC_KEY} />);

    expect(await screen.findByText("Your account is healthy")).toBeInTheDocument();
    expect(screen.getByText("1.0000000 XLM")).toBeInTheDocument();
  });

  it("handles an account with no trustlines and shows the empty trustline message", async () => {
    loadAccountMock.mockResolvedValue(
      account({
        balances: [{ asset_type: "native", balance: "20.0000000" }],
        subentry_count: 0,
        home_domain: "",
      }) as Awaited<ReturnType<typeof server.loadAccount>>,
    );

    render(<WalletHealthPanel publicKey={PUBLIC_KEY} />);

    expect(await screen.findByText("0 trustlines")).toBeInTheDocument();
    expect(screen.getByText("No extra reserves")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("shows a loading skeleton while the Horizon account request is pending", () => {
    loadAccountMock.mockReturnValue(new Promise(() => {}));

    const { container } = render(<WalletHealthPanel publicKey={PUBLIC_KEY} />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(10);
    expect(screen.queryByText("Your account is healthy")).not.toBeInTheDocument();
  });

  it("shows the Horizon error and allows the user to retry", async () => {
    loadAccountMock
      .mockRejectedValueOnce(new Error("Account not found"))
      .mockResolvedValueOnce(account() as Awaited<ReturnType<typeof server.loadAccount>>);

    render(<WalletHealthPanel publicKey={PUBLIC_KEY} />);

    expect(await screen.findByText("Account not found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Your account is healthy")).toBeInTheDocument();
    });
    expect(loadAccountMock).toHaveBeenCalledTimes(2);
  });
});
