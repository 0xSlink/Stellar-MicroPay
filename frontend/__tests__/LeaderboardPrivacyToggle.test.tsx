import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LeaderboardPrivacyToggle from "@/components/LeaderboardPrivacyToggle";

jest.mock("@/lib/auth", () => ({ getJwtToken: jest.fn() }));
import { getJwtToken } from "@/lib/auth";

const mockedToken = getJwtToken as jest.Mock;

describe("LeaderboardPrivacyToggle", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("asks the user to sign in when there is no JWT", () => {
    mockedToken.mockReturnValue(null);
    global.fetch = jest.fn();
    render(<LeaderboardPrivacyToggle />);
    expect(screen.getByText(/sign in with your wallet/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("loads the current preference and saves a change", async () => {
    mockedToken.mockReturnValue("jwt-123");
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { optedOut: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { optedOut: true } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LeaderboardPrivacyToggle />);
    const box = screen.getByLabelText("Hide me from leaderboards") as HTMLInputElement;
    await waitFor(() => expect(box.disabled).toBe(false));
    expect(box.checked).toBe(false);

    fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(true));

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(/\/api\/tips\/leaderboard\/opt-out$/);
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
    expect(JSON.parse(init.body)).toEqual({ optedOut: true });
  });

  it("shows an error when saving fails", async () => {
    mockedToken.mockReturnValue("jwt-123");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { optedOut: false } }) })
      .mockResolvedValueOnce({ ok: false, status: 500 }) as unknown as typeof fetch;

    render(<LeaderboardPrivacyToggle />);
    const box = screen.getByLabelText("Hide me from leaderboards") as HTMLInputElement;
    await waitFor(() => expect(box.disabled).toBe(false));
    fireEvent.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
  });
});
