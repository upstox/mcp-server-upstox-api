import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv } from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_TRADES_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError, handleUpstoxApiResponse } from "../utils";

export const getTradesSchema = {
  // No parameters needed - access token comes from OAuth context
};

const GetTradesArgsSchema = z.object(getTradesSchema);

interface UpstoxTradesResponse {
  status: string;
  data: Array<{
    exchange: string;
    instrument_token: string;
    product: string;
    tradingsymbol: string;
    trade_id: string;
    order_id: string;
    exchange_order_id: string;
    exchange_time: string;
    time_in_micro: string;
    is_index: boolean;
    traded_price: number;
    traded_quantity: number;
    traded_value: number;
  }>;
}

export const getTradesHandler: ToolHandler<{}> = async (args: {}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetTradesArgsSchema.parse(args);
  
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
  
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_TRADES_ENDPOINT}`, {
    method: "GET",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  const authError = await handleUpstoxApiResponse(response, props.sessionId, kv);
  if (authError) return authError;

  const data = await response.json() as UpstoxTradesResponse;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};