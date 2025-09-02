import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv} from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_ORDER_TRADES_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getOrderTradesSchema = {
  orderId: z.string().min(1, "Order ID is required")
};

const GetOrderTradesArgsSchema = z.object(getOrderTradesSchema);

interface UpstoxOrderTradesResponse {
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

export const getOrderTradesHandler: ToolHandler<{orderId: string}> = async (args: {orderId: string}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetOrderTradesArgsSchema.parse(args);

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
  const accessToken = await getAccessTokenFromSession(props.sessionId, kv, env.OAUTH_PROVIDER);
  if (!accessToken) {
    return createAuthenticationExpiredError();
  }
  
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_ORDER_TRADES_ENDPOINT}/${validatedArgs.orderId}`, {
    method: "GET",
      headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxOrderTradesResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};