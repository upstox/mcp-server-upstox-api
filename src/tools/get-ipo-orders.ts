import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv, GetIpoOrdersArgs, UpstoxIpoOrder } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_IPO_ORDERS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getIpoOrdersSchema = {
  page_number: z.number().int().min(1).optional()
    .describe("Page number, starting from 1. Default: 1."),
  records: z.number().int().min(1).max(30).optional()
    .describe("Items per page (max 30). Default: 10.")
};

const GetIpoOrdersArgsSchema = z.object(getIpoOrdersSchema);

interface UpstoxIpoOrdersResponse {
  status: string;
  data: UpstoxIpoOrder[];
  // Pagination metadata is passed through to the caller untouched, so it is
  // typed loosely rather than pinned to a shape that may drift upstream.
  meta_data?: Record<string, unknown>;
}

export const getIpoOrdersHandler: ToolHandler<GetIpoOrdersArgs> = async (args: GetIpoOrdersArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
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

  const data = await response.json() as UpstoxIpoOrdersResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
