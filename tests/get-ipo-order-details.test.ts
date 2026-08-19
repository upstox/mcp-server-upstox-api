import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIpoOrderDetailsHandler } from "../src/tools/get-ipo-order-details";

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
    exchange: "BSE",
    order_id: "APP123456789",
    status: "ipo_allotted",
    order_status: "allotted",
    payment_status: "mandate_accepted",
    category: "IND",
    issue_type: "sme",
    reason: null,
    upi: "user@upi",
    upi_amount_blocked: "123000.00",
    nse_submitted_date: null,
    bse_submitted_date: "2026-05-21T10:15:00",
    mandate_approved_date: "2026-05-21T11:00:00",
    rejection_date: null,
    mandate_rejection_date: null,
    cancel_requested_date: null,
    cancel_accepted_date: null,
    units_allotted: 3000,
    bids: [
      {
        quantity: 3000,
        price: 41,
        amount: 123000,
        message: null
      }
    ],
    created_at: "2026-05-21T10:14:30",
    last_updated_at: "2026-05-27T09:00:00"
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

describe("getIpoOrderDetailsHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should require an application ID", async () => {
    await expect(
      getIpoOrderDetailsHandler({ orderId: "" }, buildExtra())
    ).rejects.toThrow();
  });

  it("should return an authentication error when no session ID is present", async () => {
    const result = await getIpoOrderDetailsHandler({ orderId: "APP123456789" }, {});
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
  });

  it("should return an API error when the KV namespace is unavailable", async () => {
    const result = await getIpoOrderDetailsHandler(
      { orderId: "APP123456789" },
      { props: { sessionId: "session-1" }, env: {} }
    );
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("API_ERROR");
  });

  it("should return an authentication error when the session has expired", async () => {
    const result = await getIpoOrderDetailsHandler(
      { orderId: "APP123456789" },
      buildExtra(null)
    );
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
    expect(result.metadata?.requiresReauth).toBe(true);
  });

  it("should successfully fetch IPO order details", async () => {
    mockFetchOk();

    const result = await getIpoOrderDetailsHandler({ orderId: "APP123456789" }, buildExtra());
    const content = result.content[0];
    if (content.type === "text") {
      expect(content.text).toBe(JSON.stringify(mockResponse, null, 2));
    }
  });

  it("should append the application id as a path segment, not a query parameter", async () => {
    mockFetchOk();

    await getIpoOrderDetailsHandler({ orderId: "APP123456789" }, buildExtra());
    expect(fetchedUrl()).toBe("https://api.upstox.com/v2/ipos/orders/APP123456789");
  });

  it("should encode an application id containing path-significant characters", async () => {
    mockFetchOk();

    await getIpoOrderDetailsHandler({ orderId: "weird/id?x=1" }, buildExtra());
    const url = new URL(fetchedUrl());
    expect(url.pathname).toBe("/v2/ipos/orders/weird%2Fid%3Fx%3D1");
    expect(url.search).toBe("");
  });

  it("should send the bearer token and Accept header", async () => {
    mockFetchOk();

    await getIpoOrderDetailsHandler({ orderId: "APP123456789" }, buildExtra());
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

    const result = await getIpoOrderDetailsHandler({ orderId: "APP123456789" }, buildExtra());
    expect(result.isError).toBe(true);
    expect(result.metadata?.errorType).toBe("AUTHENTICATION_EXPIRED");
    expect(result.metadata?.requiresReauth).toBe(true);
  });

  it("should handle API errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400
    });

    await expect(
      getIpoOrderDetailsHandler({ orderId: "APP123456789" }, buildExtra())
    ).rejects.toThrow("Error occurred while calling Upstox API");
  });

  it("should validate the response data structure", async () => {
    mockFetchOk();

    const result = await getIpoOrderDetailsHandler({ orderId: "APP123456789" }, buildExtra());
    const content = result.content[0];
    if (content.type === "text") {
      const parsedData = JSON.parse(content.text);
      expect(parsedData).toHaveProperty("status");
      expect(parsedData).toHaveProperty("data");

      const application = parsedData.data;
      expect(application).toHaveProperty("order_id");
      expect(application).toHaveProperty("order_status");
      expect(application).toHaveProperty("payment_status");
      expect(application).toHaveProperty("category");
      expect(application).toHaveProperty("units_allotted");
      expect(Array.isArray(application.bids)).toBe(true);
      expect(application.bids[0]).toHaveProperty("quantity");
      expect(application.bids[0]).toHaveProperty("amount");
    }
  });
});
