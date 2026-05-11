import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_MF_HOLDINGS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getMfHoldingsSchema = {};

const GetMfHoldingsArgsSchema = z.object({});

interface UpstoxMfHoldingsResponse {
  status: string;
  data: Array<Record<string, unknown>>;
}

export const getMfHoldingsHandler: ToolHandler<{}> = async (args: {}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  GetMfHoldingsArgsSchema.parse(args);

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

  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_MF_HOLDINGS_ENDPOINT}`, {
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

  const data = await response.json() as UpstoxMfHoldingsResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
