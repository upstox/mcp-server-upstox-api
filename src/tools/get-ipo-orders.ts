import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_IPO_ORDERS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getIpoOrdersSchema = {
  pageNumber: z.number().int().min(1).optional(),
  records: z.number().int().min(1).max(30).optional()
};

const GetIpoOrdersArgsSchema = z.object(getIpoOrdersSchema);

interface UpstoxIpoOrdersResponse {
  status: string;
  data: Array<{
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
  }>;
  // Pagination metadata is passed through to the caller untouched, so it is
  // typed loosely rather than pinned to a shape that may drift upstream.
  meta_data?: Record<string, unknown>;
}

export const getIpoOrdersHandler: ToolHandler<{pageNumber?: number; records?: number}> = async (args: {pageNumber?: number; records?: number}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetIpoOrdersArgsSchema.parse(args);

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

  // Build URL with query parameters. Upstox applies its own defaults
  // (page_number=1, records=10) for anything omitted.
  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_IPO_ORDERS_ENDPOINT}`);
  if (validatedArgs.pageNumber !== undefined) {
    url.searchParams.append('page_number', String(validatedArgs.pageNumber));
  }
  if (validatedArgs.records !== undefined) {
    url.searchParams.append('records', String(validatedArgs.records));
  }

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

  const data = await response.json() as UpstoxIpoOrdersResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
