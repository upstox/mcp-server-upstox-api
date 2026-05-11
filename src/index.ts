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

  const tool = async (name: string, fn: () => Promise<ToolResponse>): Promise<ToolResponse> => {
    const response = applyAuthErrorMetadata(name, await fn());
    if (response.isError && response.metadata?.requiresReauth) {
      console.log(`[mcp] auth error in ${name} — signalling re-auth`);
    }
    return response;
  };

  server.registerTool("get-profile", { title: "Get Profile", inputSchema: getProfileSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-profile", () => getProfileHandler(args as {}, { ...extra, ...ctx }));
  });

  server.registerTool("get-funds-margin", { title: "Get Funds & Margin", inputSchema: getFundsMarginSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-funds-margin", () => getFundsMarginHandler(args as { segment?: 'SEC' | 'COM' }, { ...extra, ...ctx }));
  });

  server.registerTool("get-holdings", { title: "Get Holdings", inputSchema: getHoldingsSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-holdings", () => getHoldingsHandler(args as {}, { ...extra, ...ctx }));
  });

  server.registerTool("get-positions", { title: "Get Positions", inputSchema: getPositionsSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-positions", () => getPositionsHandler(args as {}, { ...extra, ...ctx }));
  });

  server.registerTool("get-mtf-positions", { title: "Get MTF Positions", inputSchema: getMtfPositionsSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-mtf-positions", () => getMtfPositionsHandler(args as {}, { ...extra, ...ctx }));
  });

  server.registerTool("get-order-book", { title: "Get Order Book", inputSchema: getOrderBookSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-order-book", () => getOrderBookHandler(args as {}, { ...extra, ...ctx }));
  });

  server.registerTool("get-order-details", { title: "Get Order Details", inputSchema: getOrderDetailsSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-order-details", () => getOrderDetailsHandler(args as { orderId: string }, { ...extra, ...ctx }));
  });

  server.registerTool("get-trades", { title: "Get Trades", inputSchema: getTradesSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-trades", () => getTradesHandler(args as {}, { ...extra, ...ctx }));
  });

  server.registerTool("get-order-trades", { title: "Get Trades for Order", inputSchema: getOrderTradesSchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-order-trades", () => getOrderTradesHandler(args as { orderId: string }, { ...extra, ...ctx }));
  });

  server.registerTool("get-order-history", { title: "Get Order History", inputSchema: getOrderHistorySchema, annotations: READ_ONLY_ANNOTATIONS }, async (args, extra) => {
    return tool("get-order-history", () => getOrderHistoryHandler(args as { orderId?: string; tag?: string }, { ...extra, ...ctx }));
  });
}

const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props: Props }): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

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
    const response = await transport.handleRequest(request);
    ctx.waitUntil(
      (async () => {
        try {
          await transport.close();
          await server.close();
        } catch {
          // best-effort cleanup
        }
      })(),
    );
    return response;
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
