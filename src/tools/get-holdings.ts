import { z } from "zod";
import { ToolHandler, ToolResponse } from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_HOLDINGS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession } from "../utils";

export const getHoldingsSchema = {
  // No parameters needed - access token comes from session
};

const GetHoldingsArgsSchema = z.object({});

interface UpstoxHoldingsResponse {
  status: string;
  data: Array<{
    isin: string;
    cnc_used_quantity: number;
    collateral_type: string;
    company_name: string;
    haircut: number;
    product: string;
    quantity: number;
    tradingsymbol: string;
    trading_symbol: string;
    last_price: number;
    close_price: number;
    pnl: number;
    day_change: number;
    day_change_percentage: number;
    instrument_token: string;
    average_price: number;
    collateral_quantity: number;
    collateral_update_quantity: number;
    t1_holding_quantity: number;
    exchange: string;
  }>;
}

export const getHoldingsHandler: ToolHandler<{}> = async (args: {}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetHoldingsArgsSchema.parse(args);
  
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
  
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_HOLDINGS_ENDPOINT}`, {
    method: "GET",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxHoldingsResponse;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
}; 