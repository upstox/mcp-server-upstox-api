import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_IPO_ORDERS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getIpoOrderDetailsSchema = {
  // The IPO application identifier, as returned by get-ipo-orders.
  orderId: z.string().min(1)
};

const GetIpoOrderDetailsArgsSchema = z.object(getIpoOrderDetailsSchema);

interface UpstoxIpoOrderDetailsResponse {
  status: string;
  data: {
    id: string;
    symbol: string;
    exchange: string;
    order_id: string;
    status: string;
    order_status: string;
    payment_status: string;
    category: string;
    issue_type: string;
    reason: string | null;
    upi: string;
    upi_amount_blocked: string;
    nse_submitted_date: string | null;
    bse_submitted_date: string | null;
    mandate_approved_date: string | null;
    rejection_date: string | null;
    mandate_rejection_date: string | null;
    cancel_requested_date: string | null;
    cancel_accepted_date: string | null;
    units_allotted: number;
    bids: Array<{
      quantity: number;
      price: number;
      amount: number;
      message: string | null;
    }>;
    created_at: string;
    last_updated_at: string;
  };
}

export const getIpoOrderDetailsHandler: ToolHandler<{orderId: string}> = async (args: {orderId: string}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetIpoOrderDetailsArgsSchema.parse(args);

  // Get session ID from props
  const props = extra.props as Props;
  if (!props?.sessionId) {
    return createSessionNotFoundError();
  }

  const env = extra.env as ToolEnv;
  // Get KV namespace from environment
  const kv = (env)?.OAUTH_KV;
  if (!kv) {
    return createKVNotAvailableError();
  }

  // Get access token from session
  const accessToken = await getAccessTokenFromSession(props.sessionId, kv);
  if (!accessToken) {
    return createAuthenticationExpiredError();
  }

  // The application id is a path segment, not a query parameter, so it is
  // encoded to keep an unexpected value from altering the request path.
  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_IPO_ORDERS_ENDPOINT}/${encodeURIComponent(validatedArgs.orderId)}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxIpoOrderDetailsResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
