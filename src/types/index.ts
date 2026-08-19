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

export interface GetMfOrderBookArgs {
  status?: string;
  transaction_type?: 'BUY' | 'SELL' | 'ALL';
  page_number?: number;
  records?: number;
}

export interface GetMfOrderDetailsArgs {
  orderId: string;
}

export interface GetMfSipsArgs {
  page_number?: number;
  records?: number;
}

export interface GetIposArgs {
  status?: 'open' | 'closed' | 'listed' | 'upcoming';
  issue_type?: 'regular' | 'sme';
  page_number?: number;
  records?: number;
}

export interface GetIpoDetailsArgs {
  ipoId: string;
}

export interface GetIpoOrdersArgs {
  page_number?: number;
  records?: number;
}

export interface GetIpoOrderDetailsArgs {
  orderId: string;
}

/**
 * One IPO application (bid) as returned by Upstox. Shared by the IPO order book
 * and the single-application endpoint, which return the same shape.
 */
export interface UpstoxIpoOrder {
  id: string;
  symbol: string;
  exchange: string;
  order_id: string;
  status: string;
  order_status: string;
  payment_status: string;
  category: string;
  issue_type: string;
  reason: string | null;
  upi: string;
  upi_amount_blocked: string;
  nse_submitted_date: string | null;
  bse_submitted_date: string | null;
  mandate_approved_date: string | null;
  rejection_date: string | null;
  mandate_rejection_date: string | null;
  cancel_requested_date: string | null;
  cancel_accepted_date: string | null;
  units_allotted: number;
  bids: Array<{
    quantity: number;
    price: number;
    amount: number;
    message: string | null;
  }>;
  created_at: string;
  last_updated_at: string;
}

export interface ToolEnv extends Env {
  OAUTH_PROVIDER: OAuthHelpers;
}