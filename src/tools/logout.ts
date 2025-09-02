import { ToolHandler, ToolResponse, ToolEnv } from "../types";
import { 
  UPSTOX_API_BASE_URL, 
  HEADERS,
  ERROR_MESSAGES,
  UPSTOX_API_LOGOUT
} from "../constants";
import { Props, getValidSessionData, cleanupExpiredSession, createSessionNotFoundError, createKVNotAvailableError } from "../utils";

export const logoutSchema = {
  // No parameters needed - access token comes from session
};

export const logoutHandler: ToolHandler<{}> = async (args: {}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  // Get session ID from props
  const props = extra.props as Props;
  if (!props?.sessionId) {
    return createSessionNotFoundError();
  }

  const env = extra.env as ToolEnv;
  // Get KV namespace from environment
  const kv = env?.OAUTH_KV;
  if (!kv) {
    return createKVNotAvailableError();
  }

  // Get session data
  const sessionData = await getValidSessionData(props.sessionId, kv, env.OAUTH_PROVIDER);
  if (!sessionData || !sessionData.accessToken) {
    return {
      content: [{
        type: "text",
        text: "Error: Session expired or invalid. Please re-authenticate."
      }],
      isError: true,
      metadata: {
        errorType: "AUTHENTICATION_EXPIRED",
        requiresReauth: true
      }
    };
  }

  const accessToken = sessionData.accessToken;

  // Call Upstox logout API
  const response = await fetch(`${UPSTOX_API_BASE_URL}${UPSTOX_API_LOGOUT}`, {
    method: "DELETE",
    headers: {
      "Accept": HEADERS.ACCEPT,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.API_ERROR);
  }

  // Clean up session and OAuth data after successful logout
  try {
    await cleanupExpiredSession(props.sessionId, sessionData, kv, env.OAUTH_PROVIDER);
    console.log("Successfully cleaned up session data");
  } catch (error) {
    console.error("Error cleaning up session data:", error);
    // Don't fail the logout if cleanup fails
  }

  return {
    content: [{
      type: "text",
      text: "Successfully logged out."
    }]
  };
};
