import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  getProfileSchema, getProfileHandler,
  getFundsMarginSchema, getFundsMarginHandler,
  getHoldingsSchema, getHoldingsHandler,
  getPositionsSchema, getPositionsHandler,
  getMtfPositionsSchema, getMtfPositionsHandler,
  getOrderBookSchema, getOrderBookHandler,
  getOrderDetailsSchema, getOrderDetailsHandler,
  getTradesSchema, getTradesHandler,
  getOrderTradesSchema, getOrderTradesHandler,
  getOrderHistorySchema, getOrderHistoryHandler,
  logoutSchema, logoutHandler
} from "./tools";
import UpstoxHandler from "./upstox-handler";
import { Props } from "./utils";
import { ToolResponse } from "./types";

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Upstox MCP Agent",
    version: "1.0.0",
  });

  private handleAuthError(toolName: string, response: ToolResponse): never | ToolResponse {
    if (response.isError && (
      response.metadata?.errorType === "AUTHENTICATION_EXPIRED" || 
      response.metadata?.errorType === "AUTHENTICATION_INVALID"
    )) {
      console.log(`Authentication error in ${toolName}`);
      
      // Set requiresReauth to true for authentication errors
      if (response.metadata) {
        response.metadata.requiresReauth = true;
      } else {
        response.metadata = {
          requiresReauth: true
        };
      }
    }
    
    return response;
  }

  async init() {
    console.log("MCP Agent initialized");

    this.server.tool("get-profile", getProfileSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getProfileHandler(args as {}, enhancedExtra);
      return this.handleAuthError("get-profile", response);
    });
    
    this.server.tool("get-funds-margin", getFundsMarginSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getFundsMarginHandler(args as {segment?: 'SEC' | 'COM'}, enhancedExtra);
      return this.handleAuthError("get-funds-margin", response);
    });
    
    this.server.tool("get-holdings", getHoldingsSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getHoldingsHandler(args as {}, enhancedExtra);
      return this.handleAuthError("get-holdings", response);
    });
    
    this.server.tool("get-positions", getPositionsSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getPositionsHandler(args as {}, enhancedExtra);
      return this.handleAuthError("get-positions", response);
    });
    
    this.server.tool("get-mtf-positions", getMtfPositionsSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getMtfPositionsHandler(args as {}, enhancedExtra);
      return this.handleAuthError("get-mtf-positions", response);
    });
    
    this.server.tool("get-order-book", getOrderBookSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getOrderBookHandler(args as {}, enhancedExtra);
      return this.handleAuthError("get-order-book", response);
    });
    
    this.server.tool("get-order-details", getOrderDetailsSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getOrderDetailsHandler(args as {orderId: string}, enhancedExtra);
      return this.handleAuthError("get-order-details", response);
    });
    
    this.server.tool("get-trades", getTradesSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getTradesHandler(args as {}, enhancedExtra);
      return this.handleAuthError("get-trades", response);
    });
    
    this.server.tool("get-order-trades", getOrderTradesSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getOrderTradesHandler(args as {orderId: string}, enhancedExtra);
      return this.handleAuthError("get-order-trades", response);
    });
    
    this.server.tool("get-order-history", getOrderHistorySchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await getOrderHistoryHandler(args as {orderId?: string; tag?: string}, enhancedExtra);
      return this.handleAuthError("get-order-history", response);
    });

    this.server.tool("logout", logoutSchema, async (args, extra) => {
      const enhancedExtra = { ...extra, props: this.props, env: this.env };
      const response = await logoutHandler(args as {}, enhancedExtra);
      return this.handleAuthError("logout", response);
    });
  }
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: MyMCP.mount("/sse") as any,
  defaultHandler: UpstoxHandler as any,
  clientRegistrationEndpoint: "/register",
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token"
});