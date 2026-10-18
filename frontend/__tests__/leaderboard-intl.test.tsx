import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Leaderboard from "@/pages/leaderboard";

const originalLanguage = Object.getOwnPropertyDescriptor(
  window.navigator,
  "language"
);

function setLocale(locale: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: locale,
  });
}

describe("Leaderboard intl formatting", () => {
  beforeEach(() => {
    setLocale("es-ES");
    global.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: {
              recipients: [
                { publicKey: "GRECIPIENT1234567890", totalXLM: "1234.5678" },
              ],
              senders: [
                { publicKey: "GSENDER1234567890", totalXLM: "9876.5432" },
              ],
              totalTips: 1234,
              totalXLM: "12345.6789",
            },
          }),
        }) as Response
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalLanguage) {
      Object.defineProperty(window.navigator, "language", originalLanguage);
    }
  });

  it("renders locale-aware amounts instead of en-US separators", async () => {
    render(<Leaderboard />);

    // 1234.5678 in es-ES uses a dot for grouping and a comma for decimals.
    expect(await screen.findAllByText("1.234,5678")).toHaveLength(1);
    expect(screen.getByText("9.876,5432")).toBeInTheDocument();
    expect(screen.getByText("12.345,6789")).toBeInTheDocument();
    expect(screen.getByText("1.234")).toBeInTheDocument();
  });
});
