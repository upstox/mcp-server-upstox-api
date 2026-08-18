import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv, GetMfOrderBookArgs } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_MF_ORDER_BOOK_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getMfOrderBookSchema = {
  status: z.enum(["ALL", "ARCHIVED", "NEW", "PENDING", "OPEN", "INPROCESS", "COMPLETED"]).optional()
    .describe("Filter by order status. Default: ALL."),
  transaction_type: z.enum(["BUY", "SELL", "ALL"]).optional()
    .describe("Filter by transaction type. Default: ALL."),
  page_number: z.number().int().min(1).optional()
    .describe("Page number, starting from 1. Default: 1."),
  records: z.number().int().min(1).max(30).optional()
    .describe("Items per page (max 30). Default: 10."),
};

const GetMfOrderBookArgsSchema = z.object(getMfOrderBookSchema);

interface UpstoxMfOrderBookResponse {
  status: string;
  data: Array<Record<string, unknown>>;
}

export const getMfOrderBookHandler: ToolHandler<GetMfOrderBookArgs> = async (args: GetMfOrderBookArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetMfOrderBookArgsSchema.parse(args);

  const props = extra.props as Props;
  if (!props?.sessionId) {
    return createSessionNotFoundError();
  }

  const env = extra.env as ToolEnv;
  const kv = env?.OAUTH_KV;
  if (!kv) {
    return createKVNotAvailableError();
  }

  const accessToken = await getAccessTokenFromSession(props.sessionId, kv);
  if (!accessToken) {
    return createAuthenticationExpiredError();
  }

  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_MF_ORDER_BOOK_ENDPOINT}`);
  if (validatedArgs.status !== undefined) url.searchParams.append("status", validatedArgs.status);
  if (validatedArgs.transaction_type !== undefined) url.searchParams.append("transaction_type", validatedArgs.transaction_type);
  if (validatedArgs.page_number !== undefined) url.searchParams.append("page_number", String(validatedArgs.page_number));
  if (validatedArgs.records !== undefined) url.searchParams.append("records", String(validatedArgs.records));

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

  const data = await response.json() as UpstoxMfOrderBookResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
