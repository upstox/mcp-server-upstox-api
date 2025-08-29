import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { getUpstreamAuthorizeUrl, fetchUpstreamAuthToken, Props } from "./utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

// OAuth Discovery Endpoint - Required for MCP client compatibility
app.get("/.well-known/oauth-authorization-server", async (c) => {
    const baseUrl = new URL(c.req.url).origin;
    
    return c.json({
        "issuer": baseUrl,
        "authorization_endpoint": `${baseUrl}/authorize`,
        "token_endpoint": `${baseUrl}/token`,
        "registration_endpoint": `${baseUrl}/register`,
        "scopes_supported": ["read", "write"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
        "introspection_endpoint": `${baseUrl}/introspect`,
        "revocation_endpoint": `${baseUrl}/revoke`
    });
});

// SSE-specific OAuth discovery endpoint
app.get("/.well-known/oauth-authorization-server/sse", async (c) => {
    const baseUrl = new URL(c.req.url).origin;
    
    return c.json({
        "issuer": baseUrl,
        "authorization_endpoint": `${baseUrl}/authorize`,
        "token_endpoint": `${baseUrl}/token`,
        "registration_endpoint": `${baseUrl}/register`,
        "scopes_supported": ["read", "write"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
        "introspection_endpoint": `${baseUrl}/introspect`,
        "revocation_endpoint": `${baseUrl}/revoke`,
        "sse_endpoint": `${baseUrl}/sse`
    });
});

// OAuth Protected Resource Discovery
app.get("/.well-known/oauth-protected-resource", async (c) => {
    const baseUrl = new URL(c.req.url).origin;
    
    return c.json({
        "resource": baseUrl,
        "authorization_servers": [baseUrl],
        "scopes_supported": ["read", "write"],
        "bearer_methods_supported": ["header", "body", "query"],
        "resource_documentation": `${baseUrl}/docs`
    });
});

// SSE-specific protected resource discovery endpoint
app.get("/.well-known/oauth-protected-resource/sse", async (c) => {
    const baseUrl = new URL(c.req.url).origin;
    
    return c.json({
        "resource": `${baseUrl}/sse`,
        "authorization_servers": [baseUrl],
        "scopes_supported": ["read", "write"],
        "bearer_methods_supported": ["header", "body", "query"],
        "resource_documentation": `${baseUrl}/docs`,
        "sse_endpoint": `${baseUrl}/sse`
    });
});

// Client Registration Endpoint - Handle dynamic client registration
app.post("/register", async (c) => {
    try {
        const registrationData = await c.req.json();
        
        // Generate client credentials
        const clientId = crypto.randomUUID();
        const clientSecret = crypto.randomUUID();
        
        // Store client information (in a real implementation, you'd store this in a database)
        // For now, we'll use KV store
        const clientInfo = {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uris: registrationData.redirect_uris || [],
            client_name: registrationData.client_name || "MCP Client",
            scope: registrationData.scope || "read write",
            grant_types: registrationData.grant_types || ["authorization_code"],
            response_types: registrationData.response_types || ["code"],
            created_at: Date.now()
        };
        
        // Store client info in KV
        await c.env.OAUTH_KV.put(`client:${clientId}`, JSON.stringify(clientInfo), {
            expirationTtl: 86400 // 24 hours
        });
        
        return c.json({
            client_id: clientId,
            client_secret: clientSecret,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            client_secret_expires_at: 0, // Never expires
            redirect_uris: clientInfo.redirect_uris,
            grant_types: clientInfo.grant_types,
            response_types: clientInfo.response_types,
            scope: clientInfo.scope
        }, 201);
        
    } catch (error) {
        console.error("Client registration error:", error);
        return c.json({ error: "invalid_client_metadata" }, 400);
    }
});

app.get("/authorize", async (c) => {
    try {
        const oauthRequestInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
        const { clientId } = oauthRequestInfo;
        if (!clientId) {
            return c.text("Invalid request: missing client_id", 400);
        }

        // Verify client exists (for MCP clients)
        const clientInfo = await c.env.OAUTH_KV.get(`client:${clientId}`);
        if (!clientInfo) {
            return c.text("Invalid client_id", 400);
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
                client_id: c.env.UPSTOX_CLIENT_ID,
            })
        },
        status: 302,
    });
    } catch (error) {
        console.error("Authorization error:", error);
        return c.text("Authorization failed", 500);
    }
});

app.get("/callback", async (c) => {
    try {
        const stateData = JSON.parse(atob(c.req.query("state") as string));
        const oauthReqInfo = stateData as AuthRequest;
        const clientSessionId = stateData.clientSessionId;
        
        if (!oauthReqInfo.clientId || !clientSessionId) {
            return c.text("Invalid state or missing session ID", 400);
        }

        // Verify client still exists
        const clientInfo = await c.env.OAUTH_KV.get(`client:${oauthReqInfo.clientId}`);
        if (!clientInfo) {
            return c.text("Invalid client", 400);
        }

    const [tokenDataStr, error] = await fetchUpstreamAuthToken({
        client_id: c.env.UPSTOX_CLIENT_ID,
        client_secret: c.env.UPSTOX_CLIENT_SECRET,
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
        createdAt: Date.now()
    };

    // Store session data in KV with 1 hour TTL (3600 seconds) using client's session ID
    await c.env.OAUTH_KV.put(
        `session:${clientSessionId}`, 
        JSON.stringify(sessionData), 
        { expirationTtl: 3600 }
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
    } catch (error) {
        console.error("Callback error:", error);
        return c.text("Authorization callback failed", 500);
    }
});

// Token endpoint - Handle token exchange requests
app.post("/token", async (c) => {
    try {
        const formData = await c.req.formData();
        const grantType = formData.get("grant_type");
        const clientId = formData.get("client_id");
        const clientSecret = formData.get("client_secret");
        const code = formData.get("code");
        
        if (grantType !== "authorization_code") {
            return c.json({ error: "unsupported_grant_type" }, 400);
        }
        
        if (!clientId || !clientSecret || !code) {
            return c.json({ error: "invalid_request" }, 400);
        }
        
        // Verify client credentials
        const clientInfo = await c.env.OAUTH_KV.get(`client:${clientId}`);
        if (!clientInfo) {
            return c.json({ error: "invalid_client" }, 401);
        }
        
        const client = JSON.parse(clientInfo);
        if (client.client_secret !== clientSecret) {
            return c.json({ error: "invalid_client" }, 401);
        }
        
        // For MCP clients, we need to handle token exchange differently
        // This is a simplified implementation - in production you'd validate the auth code
        const accessToken = crypto.randomUUID();
        const refreshToken = crypto.randomUUID();
        
        // Store token information
        const tokenInfo = {
            access_token: accessToken,
            refresh_token: refreshToken,
            client_id: clientId,
            scope: client.scope,
            created_at: Date.now(),
            expires_in: 3600
        };
        
        await c.env.OAUTH_KV.put(`token:${accessToken}`, JSON.stringify(tokenInfo), {
            expirationTtl: 3600 // 1 hour
        });
        
        return c.json({
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: refreshToken,
            scope: client.scope
        });
        
    } catch (error) {
        console.error("Token endpoint error:", error);
        return c.json({ error: "server_error" }, 500);
    }
});

// Token introspection endpoint
app.post("/introspect", async (c) => {
    try {
        const formData = await c.req.formData();
        const token = formData.get("token");
        
        if (!token) {
            return c.json({ active: false });
        }
        
        const tokenInfo = await c.env.OAUTH_KV.get(`token:${token}`);
        if (!tokenInfo) {
            return c.json({ active: false });
        }
        
        const tokenData = JSON.parse(tokenInfo);
        const isExpired = Date.now() > (tokenData.created_at + (tokenData.expires_in * 1000));
        
        if (isExpired) {
            return c.json({ active: false });
        }
        
        return c.json({
            active: true,
            client_id: tokenData.client_id,
            scope: tokenData.scope,
            exp: Math.floor((tokenData.created_at + (tokenData.expires_in * 1000)) / 1000)
        });
        
    } catch (error) {
        console.error("Introspection error:", error);
        return c.json({ active: false });
    }
});

export default app;