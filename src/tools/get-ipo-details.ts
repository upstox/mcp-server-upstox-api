import { z } from "zod";
import { ToolHandler, ToolResponse, ToolEnv } from "../types";
import {
  UPSTOX_API_BASE_URL,
  UPSTOX_API_IPOS_ENDPOINT,
  HEADERS,
  ERROR_MESSAGES
} from "../constants";
import { Props, getAccessTokenFromSession, createSessionNotFoundError, createKVNotAvailableError, createAuthenticationExpiredError } from "../utils";

export const getIpoDetailsSchema = {
  // The IPO identifier is a slug returned by get-ipos, e.g. "autofurnish-limited-ipo".
  ipoId: z.string().min(1)
};

const GetIpoDetailsArgsSchema = z.object(getIpoDetailsSchema);

interface UpstoxIpoDetailsResponse {
  status: string;
  data: {
    id: string;
    symbol: string;
    name: string;
    status: string;
    isin: string;
    issue_type: string;
    issue_size: number;
    industry: string;
    minimum_price: number;
    maximum_price: number;
    bidding_start_date: string;
    bidding_end_date: string;
    daily_start_time: string;
    daily_end_time: string;
    face_value: number;
    tick_size: number | null;
    lot_size: number;
    minimum_quantity: number;
    cut_off_price: number;
    listing_price: number | null;
    listing_exchange: string;
    rhp_url: string | null;
    drhp_url: string | null;
    timeline: {
      pre_apply_start_date: string;
      application_start_date: string;
      application_end_date: string;
      allotment_start_date: string;
      allotment_date: string;
      refund_initiation_date: string;
      listing_date: string;
      mandate_end_date: string;
    };
    registrar_info: {
      name: string;
      email: string;
      contact_name: string;
      contact_number: string;
      website: string;
      registrar: string;
    };
    total_subscription: string;
  };
}

export const getIpoDetailsHandler: ToolHandler<{ipoId: string}> = async (args: {ipoId: string}, extra: { [key: string]: unknown }): Promise<ToolResponse> => {
  const validatedArgs = GetIpoDetailsArgsSchema.parse(args);

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
  const accessToken = await getAccessTokenFromSession(props.sessionId, kv);
  if (!accessToken) {
    return createAuthenticationExpiredError();
  }

  // The IPO id is a path segment, not a query parameter, so it is encoded
  // to keep an unexpected value from altering the request path.
  const url = new URL(`${UPSTOX_API_BASE_URL}${UPSTOX_API_IPOS_ENDPOINT}/${encodeURIComponent(validatedArgs.ipoId)}`);

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

  const data = await response.json() as UpstoxIpoDetailsResponse;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
};
