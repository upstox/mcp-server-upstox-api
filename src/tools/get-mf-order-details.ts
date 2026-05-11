import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv, GetMfOrderDetailsArgs } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_MF_ORDER_DETAILS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getMfOrderDetailsSchema = {
  orderId: z.string().describe("Mutual fund order ID.")
};

const GetMfOrderDetailsArgsSchema = z.object(getMfOrderDetailsSchema);

interface UpstoxMfOrderDetailsResponse {
  status: string;
  data: Record<string, unknown>;
}

export const getMfOrderDetailsHandler: ToolHandler<GetMfOrderDetailsArgs> = async (args: GetMfOrderDetailsArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetMfOrderDetailsArgsSchema.parse(args);

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

  const url = `${UPSTOX_API_BASE_URL}${UPSTOX_API_MF_ORDER_DETAILS_ENDPOINT}/${encodeURIComponent(validatedArgs.orderId)}`;

  const response = await fetch(url, {
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

  const data = await response.json() as UpstoxMfOrderDetailsResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
