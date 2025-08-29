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
  getOrderHistorySchema, getOrderHistoryHandler
} from "./tools";
import UpstoxHandler from "./upstox-handler";
import { Props } from "./utils";

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Upstox MCP Agent",
    version: "1.0.0",
  });

  async init() {
    console.log("MCP Agent initialized");
    
    this.server.tool("get-profile", getProfileSchema, async (args, extra) => {
        return getProfileHandler(args as {}, extra);
    });
    
    this.server.tool("get-funds-margin", getFundsMarginSchema, async (args, extra) => {
        return getFundsMarginHandler(args as {segment?: 'SEC' | 'COM'}, extra);
    });
    
    this.server.tool("get-holdings", getHoldingsSchema, async (args, extra) => {
        return getHoldingsHandler(args as {}, extra);
    });
    
    this.server.tool("get-positions", getPositionsSchema, async (args, extra) => {
        return getPositionsHandler(args as {}, extra);
    });
    
    this.server.tool("get-mtf-positions", getMtfPositionsSchema, async (args, extra) => {
        return getMtfPositionsHandler(args as {}, extra);
    });
    
    this.server.tool("get-order-book", getOrderBookSchema, async (args, extra) => {
        return getOrderBookHandler(args as {}, extra);
    });
    
    this.server.tool("get-order-details", getOrderDetailsSchema, async (args, extra) => {
        return getOrderDetailsHandler(args as {orderId: string}, extra);
    });
    
    this.server.tool("get-trades", getTradesSchema, async (args, extra) => {
        return getTradesHandler(args as {}, extra);
    });
    
    this.server.tool("get-order-trades", getOrderTradesSchema, async (args, extra) => {
        return getOrderTradesHandler(args as {orderId: string}, extra);
    });
    
    this.server.tool("get-order-history", getOrderHistorySchema, async (args, extra) => {
        return getOrderHistoryHandler(args as {orderId?: string; tag?: string}, extra);
    });
  }
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: MyMCP.mount("/sse") as any,
  defaultHandler: UpstoxHandler as any,
  clientRegistrationEndpoint: "/register",
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
});