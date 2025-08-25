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