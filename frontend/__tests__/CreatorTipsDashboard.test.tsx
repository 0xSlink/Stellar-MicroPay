import type { AnchorHTMLAttributes } from "react";
import { render, screen, within } from "@testing-library/react";
import CreatorTipsDashboard from "@/components/CreatorTipsDashboard";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const CREATOR = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const SENDER_ONE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const SENDER_TWO = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const originalFetch = global.fetch;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: async () => data,
  } as Response;
}

function tipsPayload(
  tips: Array<Record<string, unknown>>,
  stats: Record<string, unknown>,
) {
  return {
    success: true,
    data: {
      tips,
      total: tips.length,
      limit: 10,
      offset: 0,
      stats,
    },
  };
}

function tip(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    senderPublicKey: SENDER_ONE,
    creatorPublicKey: CREATOR,
    amount: "10",
    asset: "XLM",
    memo: "Thanks for the helpful guide",
    txHash: "a".repeat(64),
    timestamp: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

describe("CreatorTipsDashboard", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    global.fetch = jest.fn().mockRejectedValue(new Error("Unexpected network request"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
  });

  it("shows the per-asset totals aggregated by the backend and recent tip records", async () => {
    const tips = [
      tip({ id: 1, amount: "10.0", memo: "First tip" }),
      tip({
        id: 2,
        senderPublicKey: SENDER_TWO,
        amount: "5.0",
        memo: "Second tip",
        timestamp: "2026-01-01T03:04:05.000Z",
      }),
      tip({
        id: 3,
        amount: "15.0",
        asset: "USDC",
        memo: "",
        timestamp: "2025-12-31T03:04:05.000Z",
      }),
    ];
    const stats = {
      totalTips: 3,
      totalByAsset: {
        XLM: { count: 2, amount: "15" },
        USDC: { count: 1, amount: "15" },
      },
      averageTip: "10",
      largestTip: "15",
      smallestTip: "5",
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(tipsPayload(tips, stats))) as jest.Mock;

    render(
      <CreatorTipsDashboard
        publicKey={CREATOR}
        username="creator"
        xlmPrice={0.2}
      />,
    );

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(
      within(screen.getByText("Total XLM Received").parentElement!).getByText("15"),
    ).toBeInTheDocument();
    expect(screen.getByText("10.00")).toBeInTheDocument();
    expect(screen.getByText("10.0 XLM")).toBeInTheDocument();
    expect(screen.getByText("5.0 XLM")).toBeInTheDocument();
    expect(screen.getByText("15.0 USDC")).toBeInTheDocument();
    expect(screen.getByText('"First tip"')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tips/received/${encodeURIComponent(CREATOR)}?limit=10&offset=0`,
    );
  });

  it("renders the empty state and zero totals when the backend returns no tips", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(
          tipsPayload([], {
            totalTips: 0,
            totalByAsset: {},
            averageTip: null,
            largestTip: null,
            smallestTip: null,
          }),
        ),
      ) as jest.Mock;

    render(<CreatorTipsDashboard publicKey={CREATOR} username="creator" />);

    expect(await screen.findByText("No tips received yet")).toBeInTheDocument();
    expect(screen.getByText("Share your tip page to start receiving tips!")).toBeInTheDocument();
    expect(
      within(screen.getByText("Total Tips Received").parentElement!).getByText("0"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Total XLM Received").parentElement!).getByText("0"),
    ).toBeInTheDocument();
  });

  it("shows an error rather than presenting a failed API response as an empty success", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, error: "Service unavailable" }, false),
    ) as jest.Mock;
    jest.spyOn(console, "error").mockImplementation(() => {});

    render(<CreatorTipsDashboard publicKey={CREATOR} username="creator" />);

    expect(
      await screen.findByText(
        "Unable to load tips. Make sure you have a registered username.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("No tips received yet")).not.toBeInTheDocument();
    expect(
      within(screen.getByText("Total Tips Received").parentElement!).getByText("0"),
    ).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith(
      "Error fetching tips:",
      expect.any(Error),
    );
  });

  it("shows the loading skeleton before the API request resolves", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;

    const { container } = render(
      <CreatorTipsDashboard publicKey={CREATOR} username="creator" />,
    );

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByText("No tips received yet")).not.toBeInTheDocument();
  });
});
