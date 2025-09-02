import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv} from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_ORDER_HISTORY_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getOrderHistorySchema = {
  orderId: z.string().optional(),
  tag: z.string().optional()
};

const GetOrderHistoryArgsSchema = z.object(getOrderHistorySchema);

interface UpstoxOrderHistoryResponse {
  status: string;
  data: Array<{
    exchange: string;
  instrument_token: string;
  order_id: string;
    exchange_order_id: string;
    parent_order_id: string;
    status: string;
    status_message: string;
    status_message_raw: string;
  order_type: string;
    order_ref_id: string;
    product: string;
  trading_symbol: string;
  tradingsymbol: string;
    instrument_name: string;
  order_timestamp: string;
    exchange_timestamp: string;
    price: number;
    trigger_price: number;
    quantity: number;
  filled_quantity: number;
    pending_quantity: number;
    average_price: number;
    disclosed_quantity: number;
    validity: string;
    order_request_id: string;
  placed_by: string;
  variety: string;
    modified: boolean;
    oms_order_id: string;
    exchange_order_no: string;
    is_amo: boolean;
    order_type_description: string;
  }>;
}

export const getOrderHistoryHandler: ToolHandler<{orderId?: string; tag?: string}> = async (args: {orderId?: string; tag?: string}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetOrderHistoryArgsSchema.parse(args);

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
  
  // Build URL with query parameters
  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_ORDER_HISTORY_ENDPOINT}`);
  if (validatedArgs.orderId) {
    url.searchParams.append('order_id', validatedArgs.orderId);
  }
  if (validatedArgs.tag) {
    url.searchParams.append('tag', validatedArgs.tag);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
      headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxOrderHistoryResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};