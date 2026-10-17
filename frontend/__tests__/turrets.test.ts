import {
  cancelTurretsFunction,
  createDcaAutomation,
  createScheduledDcaPayment,
  createStopLossAutomation,
  createTurretsChallenge,
  deployTurretsFunction,
  getTurretSignerAddress,
  getTurretsHistory,
  listTurretsFunctions,
  pauseTurretsFunction,
  resumeTurretsFunction,
  type TurretsAutomationResponse,
  type TurretsDeployment,
  type TurretsExecutionHistory,
} from "../lib/turrets";

const OWNER = "GBRPYHIL2CI3FNIDTANYQ7BACEGIA63POASRMHWDHMV65QHJTWCTBYOO";
const SIGNER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const deployment: TurretsDeployment & { signedChallengeXDR: string | null } = {
  id: "deployment-123",
  ownerPublicKey: OWNER,
  type: "dca",
  status: "active",
  config: {
    intervalMinutes: 60,
    amountQuote: 10,
    quoteAssetCode: "XLM",
    quoteAssetIssuer: null,
  },
  deploymentHash: "deployment-hash",
  signedChallengeXDR: null,
  createdAt: "2026-01-02T03:04:05.000Z",
  nextRunAt: "2026-01-02T04:04:05.000Z",
  lastExecutedAt: null,
  lastCheckedAt: null,
  lastObservedPriceUsd: null,
  lastError: null,
};

const automation: TurretsAutomationResponse = {
  ...deployment,
  turretSignerAddress: SIGNER,
};

const history: TurretsExecutionHistory[] = [
  {
    id: "history-123",
    deploymentId: deployment.id,
    status: "created",
    message: "txFunction deployed via dca wizard",
    result: null,
    createdAt: "2026-01-02T03:04:05.000Z",
  },
];

const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

function response(body: unknown, options: { ok?: boolean; status?: number } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function fetchMock() {
  return globalThis.fetch as jest.MockedFunction<typeof fetch>;
}

function queueSuccess(data: unknown, options: { status?: number } = {}) {
  fetchMock().mockResolvedValueOnce(
    response({ success: true, data }, { status: options.status }),
  );
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn().mockRejectedValue(new Error("Unexpected network request")),
  });
});

afterEach(() => {
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }

  if (originalFetch) {
    Object.defineProperty(globalThis, "fetch", originalFetch);
  } else {
    Reflect.deleteProperty(globalThis, "fetch");
  }
});

describe("Turrets API requests", () => {
  it("posts a signing challenge and returns the backend data", async () => {
    const params = {
      ownerPublicKey: OWNER,
      type: "dca" as const,
      config: { intervalMinutes: 60, amountQuote: 10 },
    };
    const challenge = {
      challengeXDR: "challenge-xdr",
      deploymentHash: "deployment-hash",
      normalizedConfig: {
        ...params.config,
        quoteAssetCode: "USDC",
        quoteAssetIssuer: null,
      },
      networkPassphrase: "Test SDF Network ; September 2015",
    };
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/";
    queueSuccess(challenge);

    await expect(createTurretsChallenge(params)).resolves.toEqual(challenge);
    expect(fetchMock()).toHaveBeenCalledWith("https://api.example.test/api/turrets/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  });

  it("posts the deployment challenge fields and returns the deployment", async () => {
    const params = {
      ownerPublicKey: OWNER,
      type: "dca" as const,
      config: { intervalMinutes: 60, amountQuote: 10 },
      deploymentHash: "deployment-hash",
      signedChallengeXDR: "signed-challenge-xdr",
    };
    queueSuccess(deployment, { status: 201 });

    await expect(deployTurretsFunction(params)).resolves.toEqual(deployment);
    expect(fetchMock()).toHaveBeenCalledWith("/api/turrets/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  });

  it("posts scheduled payment fields including the nullable optional issuer", async () => {
    const params = {
      ownerPublicKey: OWNER,
      recipient: SIGNER,
      amount: 5,
      asset: "XLM",
      assetIssuer: null,
      frequency: "weekly" as const,
    };
    const scheduledResponse: TurretsAutomationResponse = {
      ...automation,
      config: {
        intervalMinutes: 60,
        amountQuote: 10,
        quoteAssetCode: "USDC",
        quoteAssetIssuer: null,
      },
    };
    queueSuccess(scheduledResponse, { status: 201 });

    await expect(createScheduledDcaPayment(params)).resolves.toEqual(scheduledResponse);
    expect(fetchMock()).toHaveBeenCalledWith("/api/turrets/dca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  });

  it("lists deployments using an encoded owner query parameter", async () => {
    const ownerPublicKey = "G OWNER/?";
    queueSuccess([deployment]);

    await expect(listTurretsFunctions(ownerPublicKey)).resolves.toEqual([deployment]);
    expect(fetchMock()).toHaveBeenCalledWith(
      `/api/turrets?ownerPublicKey=${encodeURIComponent(ownerPublicKey)}`,
    );
  });

  it("posts DCA automation fields and preserves the signer in the response", async () => {
    const params = {
      ownerPublicKey: OWNER,
      intervalMinutes: 60,
      amountQuote: 10,
    };
    queueSuccess(automation, { status: 201 });

    await expect(createDcaAutomation(params)).resolves.toEqual(automation);
    expect(fetchMock()).toHaveBeenCalledWith("/api/turrets/dca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  });

  it("posts stop-loss fields including configured optional values", async () => {
    const params = {
      ownerPublicKey: OWNER,
      thresholdPrice: 0.1,
      amountSell: 100,
      sellAssetCode: "USDC",
      sellAssetIssuer: SIGNER,
      cooldownMinutes: 30,
    };
    const stopLossDeployment: TurretsAutomationResponse = {
      ...automation,
      type: "stop_loss",
      config: params,
    };
    queueSuccess(stopLossDeployment, { status: 201 });

    await expect(createStopLossAutomation(params)).resolves.toEqual(stopLossDeployment);
    expect(fetchMock()).toHaveBeenCalledWith("/api/turrets/stop-loss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  });

  it("extracts the signer address from the signer endpoint response", async () => {
    queueSuccess({ turretSignerAddress: SIGNER });

    await expect(getTurretSignerAddress()).resolves.toBe(SIGNER);
    expect(fetchMock()).toHaveBeenCalledWith("/api/turrets/signer");
  });

  it("loads execution history for an encoded deployment id", async () => {
    const id = "deployment/with space";
    queueSuccess(history);

    await expect(getTurretsHistory(id)).resolves.toEqual(history);
    expect(fetchMock()).toHaveBeenCalledWith(
      `/api/turrets/${encodeURIComponent(id)}/history`,
    );
  });

  it("pauses a deployment with PATCH", async () => {
    const paused = { ...deployment, status: "paused" as const };
    queueSuccess(paused);

    await expect(pauseTurretsFunction(deployment.id)).resolves.toEqual(paused);
    expect(fetchMock()).toHaveBeenCalledWith(`/api/turrets/${deployment.id}/pause`, {
      method: "PATCH",
    });
  });

  it("resumes a deployment with POST", async () => {
    queueSuccess(deployment);

    await expect(resumeTurretsFunction(deployment.id)).resolves.toEqual(deployment);
    expect(fetchMock()).toHaveBeenCalledWith(`/api/turrets/${deployment.id}/resume`, {
      method: "POST",
    });
  });

  it("cancels a deployment with DELETE", async () => {
    const cancelled = {
      id: deployment.id,
      status: "cancelled",
      cancelledAt: "2026-01-02T03:04:05.000Z",
    };
    queueSuccess(cancelled);

    await expect(cancelTurretsFunction(deployment.id)).resolves.toEqual(cancelled);
    expect(fetchMock()).toHaveBeenCalledWith(`/api/turrets/${deployment.id}`, {
      method: "DELETE",
    });
  });
});

describe("Turrets API errors", () => {
  it.each([
    [400, "Invalid configuration"],
    [404, "txFunction not found"],
    [429, "Too many requests"],
  ])("uses the backend error message for HTTP %i responses", async (status, message) => {
    fetchMock().mockResolvedValueOnce(
      response({ error: message }, { ok: false, status }),
    );

    await expect(getTurretsHistory("missing-id")).rejects.toThrow(message);
  });

  it("uses the error field when the API reports failure in a successful HTTP response", async () => {
    fetchMock().mockResolvedValueOnce(
      response({ success: false, error: "Challenge rejected" }),
    );

    await expect(getTurretSignerAddress()).rejects.toThrow("Challenge rejected");
  });

  it("uses the generic error when the response body is not valid JSON", async () => {
    fetchMock().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as unknown as Response);

    await expect(listTurretsFunctions(OWNER)).rejects.toThrow(
      "Turrets API request failed",
    );
  });

  it("uses the generic error when the response has no success flag or error", async () => {
    fetchMock().mockResolvedValueOnce(response({ data: [] }));

    await expect(listTurretsFunctions(OWNER)).rejects.toThrow(
      "Turrets API request failed",
    );
  });

  it("propagates fetch network failures unchanged", async () => {
    const networkError = new TypeError("Failed to fetch");
    fetchMock().mockRejectedValueOnce(networkError);

    await expect(getTurretSignerAddress()).rejects.toBe(networkError);
  });
});
