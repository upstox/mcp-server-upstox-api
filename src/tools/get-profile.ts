import { z } from "zod";
import { ToolHandler, ToolResponse } from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  UPSTOX_API_PROFILE_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, getKVFromContext } from "../utils";

export const getProfileSchema = {
  // No parameters needed - access token comes from session
};

const GetProfileArgsSchema = z.object(getProfileSchema);

interface UpstoxProfileResponse {
  status: string;
  data: {
    email: string;
    exchanges: string[];
    products: string[];
    broker: string;
    user_id: string;
    user_name: string;
    order_types: string[];
    user_type: string;
    poa: boolean;
    ddpi: boolean;
    is_active: boolean;
  };
}

export const getProfileHandler: ToolHandler<{}> = async (args: {}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetProfileArgsSchema.parse(args);
  
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
  
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_PROFILE_ENDPOINT}`, {
    method: "GET",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  const data = await response.json() as UpstoxProfileResponse;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
}; 