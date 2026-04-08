import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv} from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_MTF_POSITIONS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError, handleUpstoxApiResponse } from "../utils";

export const getMtfPositionsSchema = {
  // No parameters needed - access token comes from session
};

const GetMtfPositionsArgsSchema = z.object({});

interface UpstoxMtfPositionsResponse {
  status: string;
  data: Array<{
    exchange: string;
    multiplier: number;
    value: number;
    pnl: number;
    product: string;
    instrument_token: string;
    average_price: number;
    buy_value: number;
    overnight_quantity: number;
    day_buy_value: number;
    day_buy_price: number;
    overnight_buy_amount: number;
    overnight_buy_quantity: number;
    day_buy_quantity: number;
    day_sell_value: number;
    day_sell_price: number;
    overnight_sell_amount: number;
    overnight_sell_quantity: number;
    day_sell_quantity: number;
    quantity: number;
    last_price: number;
    unrealised: number;
    realised: number;
    sell_value: number;
    tradingsymbol: string;
    trading_symbol: string;
    close_price: number;
    buy_price: number;
    sell_price: number;
  }>;
}

export const getMtfPositionsHandler: ToolHandler<{}> = async (args: {}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetMtfPositionsArgsSchema.parse(args);
  
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
  
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_MTF_POSITIONS_ENDPOINT}`, {
    method: "GET",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  const authError = await handleUpstoxApiResponse(response, props.sessionId, kv);
  if (authError) return authError;

  const data = await response.json() as UpstoxMtfPositionsResponse;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};