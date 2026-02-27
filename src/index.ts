import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import type { ExportedHandlerScheduledHandler } from "@cloudflare/workers-types";
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
  getOrderHistorySchema, getOrderHistoryHandler
} from "./tools";
import UpstoxHandler from "./upstox-handler";
import { Props, getTTLUntil330AMIST } from "./utils";
import { ToolResponse } from "./types";

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Upstox MCP Agent",
    version: "1.0.0",
  });

  private handleAuthError(toolName: string, response: ToolResponse): ToolResponse {
    if (response.isError && (
      response.metadata?.errorType === "AUTHENTICATION_EXPIRED" ||
      response.metadata?.errorType === "AUTHENTICATION_INVALID"
    )) {
      console.log(`Authentication error in ${toolName}`);

      if (response.metadata?.errorType === "AUTHENTICATION_EXPIRED") {
        if (response.metadata) {
          response.metadata.requiresReauth = true;
        } else {
          response.metadata = { requiresReauth: true };
        }
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

  }
}

const oauthProvider = new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: MyMCP.serve("/mcp") as any,
  defaultHandler: UpstoxHandler as any,
  clientRegistrationEndpoint: "/register",
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  accessTokenTTL: getTTLUntil330AMIST()
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return oauthProvider.fetch(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    console.log('=== Daily KV Cleanup started at:', new Date().toISOString());
    console.log('Event cron:', controller.cron);
    console.log('Event scheduledTime:', controller.scheduledTime);
    console.log('Env OAUTH_KV available:', !!env.OAUTH_KV);
    
    try {
      // Test KV access
      if (!env.OAUTH_KV) {
        throw new Error('OAUTH_KV namespace not available');
      }

      // Get all KV keys for cleanup
      const listResult = await env.OAUTH_KV.list();
      console.log(`Found ${listResult.keys.length} total KV keys to delete`);
      
      let deletedCount = 0;
      
      // Delete all keys
      for (const key of listResult.keys) {
        await env.OAUTH_KV.delete(key.name);
        deletedCount++;
      }
      
      console.log(`Successfully deleted ${deletedCount} KV keys`);
      
      // Verify cleanup
      const verifyResult = await env.OAUTH_KV.list();
      console.log(`Verification: ${verifyResult.keys.length} keys remaining`);
      
    } catch (error) {
      console.error('Error in daily cleanup task:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
    
    console.log('=== Daily KV Cleanup completed at:', new Date().toISOString());
  },
};