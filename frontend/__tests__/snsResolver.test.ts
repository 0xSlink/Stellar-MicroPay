import { StrKey } from "@stellar/stellar-sdk";
import { resolveSNSDomain } from "@/utils/snsResolver";
import { logger } from "@/utils/logger";

jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn() },
}));

const VALID_PUBLIC_KEY =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const originalFetch = global.fetch;

function jsonResponse(body: unknown, options: { ok?: boolean; status?: number } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function fetchMock() {
  return global.fetch as jest.MockedFunction<typeof fetch>;
}

describe("resolveSNSDomain", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Unexpected network request"));
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("resolves a normalized SNS domain to a valid Stellar public key", async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ address: VALID_PUBLIC_KEY }));

    const address = await resolveSNSDomain("  Alice.XLM  ");

    expect(address).toBe(VALID_PUBLIC_KEY);
    expect(address).toMatch(/^G[A-Z2-7]{55}$/);
    expect(StrKey.isValidEd25519PublicKey(address!)).toBe(true);
    expect(fetchMock()).toHaveBeenCalledWith(
      "https://api.stellarnameservice.org/resolve?domain=alice.xlm",
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );
  });

  it("supports the alternate stellarAddress field in the response", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({ stellarAddress: VALID_PUBLIC_KEY }),
    );

    await expect(resolveSNSDomain("alice.xlm")).resolves.toBe(VALID_PUBLIC_KEY);
  });

  it("returns null when the SNS service reports that a name was not found", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({ error: "Not found" }, { ok: false, status: 404 }),
    );

    await expect(resolveSNSDomain("unregistered.xlm")).resolves.toBeNull();
  });

  it.each([
    "",
    "   ",
    "alice",
    "alice.xlm.invalid",
    ".xlm",
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  ])("rejects malformed or unsupported input %j without a request", async (domain) => {
    await expect(resolveSNSDomain(domain)).resolves.toBeNull();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("returns null for a successful response without a resolved address", async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({}));

    await expect(resolveSNSDomain("alice.xlm")).resolves.toBeNull();
  });

  it("throws and logs an error for non-404 HTTP failures", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 503 }),
    );

    await expect(resolveSNSDomain("alice.xlm")).rejects.toThrow(
      "SNS resolution failed with status 503",
    );
    expect(logger.error).toHaveBeenCalledWith(
      {
        err: expect.any(Error),
        domain: "alice.xlm",
      },
      "Error resolving SNS domain",
    );
  });

  it("propagates and logs network failures", async () => {
    const networkError = new TypeError("Failed to fetch");
    fetchMock().mockRejectedValueOnce(networkError);

    await expect(resolveSNSDomain("alice.xlm")).rejects.toBe(networkError);
    expect(logger.error).toHaveBeenCalledWith(
      { err: networkError, domain: "alice.xlm" },
      "Error resolving SNS domain",
    );
  });

  it("propagates and logs JSON parsing failures", async () => {
    const parseError = new SyntaxError("Unexpected token");
    fetchMock().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(parseError),
    } as unknown as Response);

    await expect(resolveSNSDomain("alice.xlm")).rejects.toBe(parseError);
    expect(logger.error).toHaveBeenCalledWith(
      { err: parseError, domain: "alice.xlm" },
      "Error resolving SNS domain",
    );
  });
});
