import { z } from "zod";
import { ToolHandler, ToolResponse, GetOrderDetailsArgs, ToolEnv } from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_ORDER_DETAILS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getOrderDetailsSchema = {
  orderId: z.string()
};

const GetOrderDetailsArgsSchema = z.object({
  orderId: z.string()
});

interface UpstoxOrderDetailsResponse {
  status: string;
  data: {
    exchange: string;
    price: number;
    product: string;
    quantity: number;
    instrument_token: string;
    placed_by: string;
    trading_symbol: string;
    order_type: string;
    validity: string;
    trigger_price: number;
    disclosed_quantity: number;
    transaction_type: string;
    average_price: number;
    filled_quantity: number;
    pending_quantity: number;
    status: string;
    status_message: string;
    order_id: string;
    order_request_id: string;
    order_ref_id: string;
    order_timestamp: string;
    parent_order_id: string;
    modified_quantity: number;
    modified_price: number;
    is_amo: boolean;
    variety: string;
    tag: string;
  };
}

export const getOrderDetailsHandler: ToolHandler<GetOrderDetailsArgs> = async (args: GetOrderDetailsArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetOrderDetailsArgsSchema.parse(args);
  
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
  
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_ORDER_DETAILS_ENDPOINT}/${validatedArgs.orderId}`, {
    method: "GET",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxOrderDetailsResponse;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};