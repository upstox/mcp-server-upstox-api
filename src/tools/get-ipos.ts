import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv, GetIposArgs } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_IPOS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getIposSchema = {
  status: z.enum(["open", "closed", "listed", "upcoming"]).optional()
    .describe("IPO lifecycle status. Default: open."),
  issue_type: z.enum(["regular", "sme"]).optional()
    .describe("Market segment: regular (mainboard) or sme."),
  page_number: z.number().int().min(1).optional()
    .describe("Page number, starting from 1. Default: 1."),
  records: z.number().int().min(1).max(30).optional()
    .describe("Items per page (max 30). Default: 20.")
};

const GetIposArgsSchema = z.object(getIposSchema);

interface UpstoxIposResponse {
  status: string;
  data: Array<{
    id: string;
    symbol: string;
    name: string;
    status: string;
    isin: string;
    issue_type: string;
    issue_size: number;
    industry: string;
    minimum_price: number;
    maximum_price: number;
    bidding_start_date: string;
    bidding_end_date: string;
    total_subscription: string;
  }>;
  // Pagination metadata is passed through to the caller untouched, so it is
  // typed loosely rather than pinned to a shape that may drift upstream.
  metadata?: Record<string, unknown>;
  meta_data?: Record<string, unknown>;
}

export const getIposHandler: ToolHandler<GetIposArgs> = async (args: GetIposArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetIposArgsSchema.parse(args);

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
  // (status=open, records=20, page_number=1) for anything omitted.
  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_IPOS_ENDPOINT}`);
  if (validatedArgs.status) {
    url.searchParams.append('status', validatedArgs.status);
  }
  if (validatedArgs.issue_type) {
    url.searchParams.append('issue_type', validatedArgs.issue_type);
  }
  if (validatedArgs.page_number !== undefined) {
    url.searchParams.append('page_number', String(validatedArgs.page_number));
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

  if (response.status === 401) {
    return createAuthenticationExpiredError();
  }

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxIposResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
