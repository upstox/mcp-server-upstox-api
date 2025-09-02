import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { getUpstreamAuthorizeUrl, fetchUpstreamAuthToken, Props } from "./utils";
import { getProfileHandler } from "./tools";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
    const oauthRequestInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    const { clientId } = oauthRequestInfo;
    if (!clientId) {
        return c.text("Invalid request", 400);
    }

    // Client can optionally provide their session ID, otherwise generate one
    const clientSessionId = c.req.query("session_id") || crypto.randomUUID();

    // Include the session ID in the state along with OAuth request info
    const stateData = {
        ...oauthRequestInfo,
        clientSessionId: clientSessionId
    };

    return new Response(null, {
        headers: {
            location: getUpstreamAuthorizeUrl({
                redirect_uri: new URL("/callback", c.req.raw.url).href,
                state: btoa(JSON.stringify(stateData)),
                upstream_url: "https://uat-api.upstox.com/v2/login/authorization/dialog",
                client_id: env.UPSTOX_CLIENT_ID,
            })
        },
        status: 302,
    });
});

app.get("/callback", async (c) => {
    const stateData = JSON.parse(atob(c.req.query("state") as string));
    const oauthReqInfo = stateData as AuthRequest;
    const clientSessionId = stateData.clientSessionId;
    
    if (!oauthReqInfo.clientId || !clientSessionId) {
		return c.text("Invalid state or missing session ID", 400);
	}

    const [tokenDataStr, error] = await fetchUpstreamAuthToken({
        client_id: env.UPSTOX_CLIENT_ID,
        client_secret: env.UPSTOX_CLIENT_SECRET,
        code: c.req.query("code") as string,
        redirect_uri: new URL("/callback", c.req.raw.url).href,
        upstream_url: "https://uat-api.upstox.com/v2/login/authorization/token",
    });

    if (error) return error;
    console.log(tokenDataStr);

    // Parse the token response which includes user profile data
    const userData = JSON.parse(tokenDataStr!);
    
    // Use the client's existing session ID and store session data in KV
    const sessionData = {
        accessToken: userData.access_token,
        email: userData.email || "",
        userId: userData.user_id || "",
        userName: userData.user_name || "",
        createdAt: Date.now(),
        clientId: oauthReqInfo.clientId
    };

    await c.env.OAUTH_KV.put(
        `session:${clientSessionId}`, 
        JSON.stringify(sessionData)
    );
    // Complete OAuth authorization with the client's session ID
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        props: {
            sessionId: clientSessionId
        },
        request: oauthReqInfo,
        userId: userData.user_id || "",
        metadata: {},
        scope: oauthReqInfo.scope,
    });

    if (redirectTo) {
        return Response.redirect(redirectTo, 302);
    }

    return c.text(`Authorization completed for session: ${clientSessionId}`, 200);
});

export default app;