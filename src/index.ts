import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import type { ExportedHandlerScheduledHandler } from "@cloudflare/workers-types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
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

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, openWorldHint: false, destructiveHint: false } as const;

function applyAuthErrorMetadata(toolName: string, response: ToolResponse): ToolResponse {
  if (response.isError && (
    response.metadata?.errorType === "AUTHENTICATION_EXPIRED" ||
    response.metadata?.errorType === "AUTHENTICATION_INVALID"
  )) {
    console.log(`Authentication error in ${toolName}`);
    if (response.metadata) {
      response.metadata.requiresReauth = true;
    } else {
      response.metadata = { requiresReauth: true };
    }
  }
  return response;
}

function registerTools(server: McpServer, props: Props, env: Env) {
  const ctx = { props, env };

  server.tool("get-profile", getProfileSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getProfileHandler(args as {}, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-profile", response);
  });

  server.tool("get-funds-margin", getFundsMarginSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getFundsMarginHandler(args as { segment?: 'SEC' | 'COM' }, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-funds-margin", response);
  });

  server.tool("get-holdings", getHoldingsSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getHoldingsHandler(args as {}, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-holdings", response);
  });

  server.tool("get-positions", getPositionsSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getPositionsHandler(args as {}, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-positions", response);
  });

  server.tool("get-mtf-positions", getMtfPositionsSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getMtfPositionsHandler(args as {}, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-mtf-positions", response);
  });

  server.tool("get-order-book", getOrderBookSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getOrderBookHandler(args as {}, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-order-book", response);
  });

  server.tool("get-order-details", getOrderDetailsSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getOrderDetailsHandler(args as { orderId: string }, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-order-details", response);
  });

  server.tool("get-trades", getTradesSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getTradesHandler(args as {}, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-trades", response);
  });

  server.tool("get-order-trades", getOrderTradesSchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getOrderTradesHandler(args as { orderId: string }, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-order-trades", response);
  });

  server.tool("get-order-history", getOrderHistorySchema, READ_ONLY_ANNOTATIONS, async (args, extra) => {
    const response = await getOrderHistoryHandler(args as { orderId?: string; tag?: string }, { ...extra, ...ctx });
    return applyAuthErrorMetadata("get-order-history", response);
  });
}

const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props: Props }): Promise<Response> {
    const server = new McpServer({
      name: "Upstox MCP Agent",
      version: "1.0.0",
    });

    registerTools(server, ctx.props, env);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

const oauthProvider = new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler as any,
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
      if (!env.OAUTH_KV) {
        throw new Error('OAUTH_KV namespace not available');
      }

      const listResult = await env.OAUTH_KV.list();
      console.log(`Found ${listResult.keys.length} total KV keys to delete`);

      let deletedCount = 0;

      for (const key of listResult.keys) {
        await env.OAUTH_KV.delete(key.name);
        deletedCount++;
      }

      console.log(`Successfully deleted ${deletedCount} KV keys`);

      const verifyResult = await env.OAUTH_KV.list();
      console.log(`Verification: ${verifyResult.keys.length} keys remaining`);

    } catch (error) {
      console.error('Error in daily cleanup task:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }

    console.log('=== Daily KV Cleanup completed at:', new Date().toISOString());
  },
};
