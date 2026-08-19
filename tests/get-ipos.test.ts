import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIposHandler } from "../src/tools/get-ipos";

/**
 * Builds an `extra` object matching what MyMCP passes to a tool handler:
 * `props.sessionId` plus an `env` carrying the OAUTH_KV namespace. The KV mock
 * returns a serialised SessionData blob, which is what getAccessTokenFromSession
 * expects to find under `session:<sessionId>`.
 */
function buildExtra(accessToken: string | null = "valid-token") {
  const kv = {
    get: vi.fn().mockResolvedValue(
      accessToken === null ? null : JSON.stringify({ accessToken })
    )
  };
  return { props: { sessionId: "session-1" }, env: { OAUTH_KV: kv } };
}

const mockResponse = {
  status: "success",
  data: [
    {
      id: "autofurnish-limited-ipo",
      symbol: "AFLTD",
      name: "Autofurnish IPO",
      status: "open",
      isin: "INE18HI01019",
      issue_type: "sme",
      issue_size: 15,
      industry: "Automobile Two & Three Wheelers",
      minimum_price: 41,
      maximum_price: 41,
      bidding_start_date: "2026-05-21",
      bidding_end_date: "2026-05-25",
      total_subscription: "0.68"
    }
  ],
  metadata: {
    page_number: 1,
    total_pages: 1,
    records: 20,
    total_records: 1
  }
};

function mockFetchOk() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockResponse)
  });
}

/** Returns the URL string the handler passed to fetch. */
function fetchedUrl(): string {
  return (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
}

describe("getIposHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return an authentication error when no session ID is present", async () => {
    const result = await getIposHandler({}, {});
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
  });

  it("should return an API error when the KV namespace is unavailable", async () => {
    const result = await getIposHandler({}, { props: { sessionId: "session-1" }, env: {} });
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("API_ERROR");
  });

  it("should return an authentication error when the session has expired", async () => {
    const result = await getIposHandler({}, buildExtra(null));
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
    expect(result.metadata?.requiresReauth).toBe(true);
  });

  it("should successfully fetch IPOs", async () => {
    mockFetchOk();

    const result = await getIposHandler({}, buildExtra());
    const content = result.content[0];
    if (content.type === "text") {
      expect(content.text).toBe(JSON.stringify(mockResponse, null, 2));
    }
  });

  it("should send the bearer token and Accept header", async () => {
    mockFetchOk();

    await getIposHandler({}, buildExtra());
    const options = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("GET");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer valid-token");
    expect((options.headers as Record<string, string>)["Accept"]).toBe("application/json");
  });

  it("should omit query parameters that were not supplied", async () => {
    mockFetchOk();

    await getIposHandler({}, buildExtra());
    expect(fetchedUrl()).toBe("https://api.upstox.com/v2/ipos");
  });

  it("should pass the supplied filters through as query parameters", async () => {
    mockFetchOk();

    await getIposHandler(
      { status: "upcoming", issue_type: "sme", page_number: 2, records: 5 },
      buildExtra()
    );

    const url = new URL(fetchedUrl());
    expect(url.pathname).toBe("/v2/ipos");
    expect(url.searchParams.get("status")).toBe("upcoming");
    expect(url.searchParams.get("issue_type")).toBe("sme");
    expect(url.searchParams.get("page_number")).toBe("2");
    expect(url.searchParams.get("records")).toBe("5");
  });

  it("should reject an invalid status value", async () => {
    await expect(
      getIposHandler({ status: "invalid" } as never, buildExtra())
    ).rejects.toThrow();
  });

  it("should reject an invalid issue type", async () => {
    await expect(
      getIposHandler({ issue_type: "mainboard" } as never, buildExtra())
    ).rejects.toThrow();
  });

  it("should reject records above the documented maximum of 30", async () => {
    await expect(
      getIposHandler({ records: 31 }, buildExtra())
    ).rejects.toThrow();
  });

  it("should reject a non-integer page number", async () => {
    await expect(
      getIposHandler({ page_number: 1.5 }, buildExtra())
    ).rejects.toThrow();
  });

  it("should surface a 401 as an expired session that requires re-authentication", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    });

    const result = await getIposHandler({}, buildExtra());
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
    expect(result.metadata?.requiresReauth).toBe(true);
  });

  it("should handle API errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    });

    await expect(getIposHandler({}, buildExtra())).rejects.toThrow(
      "Error occurred while calling Upstox API"
    );
  });

  it("should validate the response data structure", async () => {
    mockFetchOk();

    const result = await getIposHandler({}, buildExtra());
    const content = result.content[0];
    if (content.type === "text") {
      const parsedData = JSON.parse(content.text);
      expect(parsedData).toHaveProperty("status");
      expect(Array.isArray(parsedData.data)).toBe(true);

      const ipo = parsedData.data[0];
      expect(ipo).toHaveProperty("id");
      expect(ipo).toHaveProperty("symbol");
      expect(ipo).toHaveProperty("status");
      expect(ipo).toHaveProperty("issue_type");
      expect(ipo).toHaveProperty("minimum_price");
      expect(ipo).toHaveProperty("maximum_price");
      expect(ipo).toHaveProperty("bidding_start_date");
      expect(ipo).toHaveProperty("total_subscription");
    }
  });
});
