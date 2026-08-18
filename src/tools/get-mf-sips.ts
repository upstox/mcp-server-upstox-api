import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv, GetMfSipsArgs } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_MF_SIPS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getMfSipsSchema = {
  page_number: z.number().int().min(1).optional()
    .describe("Page number, starting from 1. Default: 1."),
  records: z.number().int().min(1).max(30).optional()
    .describe("Items per page (max 30). Default: 10."),
};

const GetMfSipsArgsSchema = z.object(getMfSipsSchema);

interface UpstoxMfSipsResponse {
  status: string;
  data: Array<Record<string, unknown>>;
}

export const getMfSipsHandler: ToolHandler<GetMfSipsArgs> = async (args: GetMfSipsArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetMfSipsArgsSchema.parse(args);

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

  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_MF_SIPS_ENDPOINT}`);
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

  const data = await response.json() as UpstoxMfSipsResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
