import { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { z } from "zod";

export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  } | {
    type: "image";
    data: string;
    mimeType: string;
  } | {
    type: "resource";
    resource: {
      text: string;
      uri: string;
      mimeType?: string;
    } | {
      uri: string;
      blob: string;
      mimeType?: string;
    };
  }>;
  _meta?: {
    [key: string]: unknown;
  };
  metadata?: {
    errorType?: "AUTHENTICATION_EXPIRED" | "AUTHENTICATION_INVALID" | "API_ERROR";
    requiresReauth?: boolean;
    [key: string]: any;
  };
  isError?: boolean;
}

export interface ToolHandler<T> {
  (args: T, extra: { [key: string]: unknown }): Promise<ToolResponse>;
}

// GetProfileArgs no longer needed - OAuth provides access token

export interface GetFundsMarginArgs {
  segment?: 'SEC' | 'COM';
}

// Holdings, Positions, MTF Positions, Trades, Order Book no longer need Args interfaces - OAuth provides access token

export interface GetOrderDetailsArgs {
  orderId: string;
}

export interface ToolEnv extends Env {
  OAUTH_PROVIDER: OAuthHelpers;
}