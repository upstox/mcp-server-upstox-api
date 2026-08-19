import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIpoDetailsHandler } from "../src/tools/get-ipo-details";

/**
 * Builds an `extra` object matching what MyMCP passes to a tool handler:
 * `props.sessionId` plus an `env` carrying the OAUTH_KV namespace.
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
  data: {
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
    daily_start_time: "10:00:00",
    daily_end_time: "17:00:00",
    face_value: 10,
    tick_size: null,
    lot_size: 3000,
    minimum_quantity: 6000,
    cut_off_price: 41,
    listing_price: null,
    listing_exchange: "BSE",
    rhp_url: null,
    drhp_url: "https://www.bsesme.com/download/example.pdf",
    timeline: {
      pre_apply_start_date: "2026-05-19",
      application_start_date: "2026-05-21",
      application_end_date: "2026-05-25",
      allotment_start_date: "2026-05-26",
      allotment_date: "2026-05-27",
      refund_initiation_date: "2026-05-28",
      listing_date: "2026-05-29",
      mandate_end_date: "2026-05-25"
    },
    registrar_info: {
      name: "Example Registrar Private Limited",
      email: "ipo@example.com",
      contact_name: "Support Desk",
      contact_number: "+91 22 0000 0000",
      website: "https://registrar.example.com",
      registrar: "EXAMPLE"
    },
    total_subscription: "0.68"
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

describe("getIpoDetailsHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should require an IPO id", async () => {
    await expect(
      getIpoDetailsHandler({ ipoId: "" }, buildExtra())
    ).rejects.toThrow();
  });

  it("should return an authentication error when no session ID is present", async () => {
    const result = await getIpoDetailsHandler({ ipoId: "autofurnish-limited-ipo" }, {});
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
  });

  it("should return an API error when the KV namespace is unavailable", async () => {
    const result = await getIpoDetailsHandler(
      { ipoId: "autofurnish-limited-ipo" },
      { props: { sessionId: "session-1" }, env: {} }
    );
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("API_ERROR");
  });

  it("should return an authentication error when the session has expired", async () => {
    const result = await getIpoDetailsHandler(
      { ipoId: "autofurnish-limited-ipo" },
      buildExtra(null)
    );
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
    expect(result.metadata?.requiresReauth).toBe(true);
  });

  it("should successfully fetch IPO details", async () => {
    mockFetchOk();

    const result = await getIpoDetailsHandler(
      { ipoId: "autofurnish-limited-ipo" },
      buildExtra()
    );
    const content = result.content[0];
    if (content.type === "text") {
      expect(content.text).toBe(JSON.stringify(mockResponse, null, 2));
    }
  });

  it("should append the IPO id as a path segment, not a query parameter", async () => {
    mockFetchOk();

    await getIpoDetailsHandler({ ipoId: "autofurnish-limited-ipo" }, buildExtra());
    expect(fetchedUrl()).toBe("https://api.upstox.com/v2/ipos/autofurnish-limited-ipo");
  });

  it("should encode an IPO id containing path-significant characters", async () => {
    mockFetchOk();

    await getIpoDetailsHandler({ ipoId: "weird/id?x=1" }, buildExtra());
    const url = new URL(fetchedUrl());
    expect(url.pathname).toBe("/v2/ipos/weird%2Fid%3Fx%3D1");
    expect(url.search).toBe("");
  });

  it("should send the bearer token and Accept header", async () => {
    mockFetchOk();

    await getIpoDetailsHandler({ ipoId: "autofurnish-limited-ipo" }, buildExtra());
    const options = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("GET");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer valid-token");
    expect((options.headers as Record<string, string>)["Accept"]).toBe("application/json");
  });

  it("should surface a 401 as an expired session that requires re-authentication", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    });

    const result = await getIpoDetailsHandler({ ipoId: "autofurnish-limited-ipo" }, buildExtra());
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
    expect(result.metadata?.requiresReauth).toBe(true);
  });

  it("should handle API errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });

    await expect(
      getIpoDetailsHandler({ ipoId: "does-not-exist" }, buildExtra())
    ).rejects.toThrow("Error occurred while calling Upstox API");
  });

  it("should validate the response data structure", async () => {
    mockFetchOk();

    const result = await getIpoDetailsHandler(
      { ipoId: "autofurnish-limited-ipo" },
      buildExtra()
    );
    const content = result.content[0];
    if (content.type === "text") {
      const parsedData = JSON.parse(content.text);
      expect(parsedData).toHaveProperty("status");
      expect(parsedData).toHaveProperty("data");

      const ipo = parsedData.data;
      expect(ipo).toHaveProperty("id");
      expect(ipo).toHaveProperty("lot_size");
      expect(ipo).toHaveProperty("minimum_quantity");
      expect(ipo).toHaveProperty("cut_off_price");
      expect(ipo).toHaveProperty("listing_exchange");
      expect(ipo).toHaveProperty("timeline");
      expect(ipo).toHaveProperty("registrar_info");
      expect(ipo.timeline).toHaveProperty("listing_date");
      expect(ipo.registrar_info).toHaveProperty("name");
    }
  });
});
