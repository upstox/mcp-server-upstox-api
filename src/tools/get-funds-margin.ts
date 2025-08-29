import { z } from "zod";
import { ToolHandler, ToolResponse, GetFundsMarginArgs } from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_FUNDS_MARGIN_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, getKVFromContext } from "../utils";

export const getFundsMarginSchema = {
  segment: z.enum(["SEC", "COM"]).optional()
};

const GetFundsMarginArgsSchema = z.object({
  segment: z.enum(["SEC", "COM"]).optional()
});

interface UpstoxFundsMarginResponse {
  status: string;
  data: {
    equity: {
      used_margin: number;
      payin_amount: number;
      span_margin: number;
      adhoc_margin: number;
      notional_cash: number;
      available_margin: number;
      exposure_margin: number;
    };
    commodity: {
      used_margin: number;
      payin_amount: number;
      span_margin: number;
      adhoc_margin: number;
      notional_cash: number;
      available_margin: number;
      exposure_margin: number;
    };
  };
}

export const getFundsMarginHandler: ToolHandler<GetFundsMarginArgs> = async (args: GetFundsMarginArgs, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetFundsMarginArgsSchema.parse(args);
  
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
  
  // Get KV namespace from context
  const kv = getKVFromContext(extra);
  if (!kv) {
    console.error('KV store not available in extra:', Object.keys(extra));
    return {
      content: [{
        type: "text",
        text: "Error: KV store not available. Please check server configuration."
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
  
  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_FUNDS_MARGIN_ENDPOINT}`);
  
  if (validatedArgs.segment) {
    url.searchParams.append('segment', validatedArgs.segment);
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

  const data = await response.json() as UpstoxFundsMarginResponse;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
}; 