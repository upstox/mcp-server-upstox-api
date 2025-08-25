import { z } from "zod";
import { ToolHandler, ToolResponse } from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_TRADES_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession } from "../utils";

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
    return {
      content: [{
        type: "text",
        text: "Error: No session ID found. Please authenticate first."
      }],
      isError: true
    };
  }
  
  // Get KV namespace from environment
  const kv = (extra.env as Env)?.OAUTH_KV;
  if (!kv) {
    return {
      content: [{
        type: "text",
        text: "Error: KV store not available."
      }],
      isError: true
    };
  }
  
  // Get access token from session
  const accessToken = await getAccessTokenFromSession(props.sessionId, kv);
  if (!accessToken) {
    return {
      content: [{
        type: "text",
        text: "Error: Session expired or invalid. Please re-authenticate."
      }],
      isError: true
    };
  }
  
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_TRADES_ENDPOINT}`, {
    method: "GET",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxTradesResponse;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
}; 