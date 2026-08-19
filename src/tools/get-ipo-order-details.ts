import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv, GetIpoOrderDetailsArgs, UpstoxIpoOrder } from "../types";
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
  data: UpstoxIpoOrder;
}

export const getIpoOrderDetailsHandler: ToolHandler<GetIpoOrderDetailsArgs> = async (args: GetIpoOrderDetailsArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
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

  if (response.status === 401) {
    return createAuthenticationExpiredError();
  }

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
