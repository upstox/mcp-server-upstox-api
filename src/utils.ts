// Helper to generate the layout
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { marked } from "marked";

// This file mainly exists as a dumping ground for uninteresting html and CSS
// to remove clutter and noise from the auth logic. You likely do not need
// anything from this file.

export const layout = (content: HtmlEscapedString | string, title: string) => html`
	<!DOCTYPE html>
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta
				name="viewport"
				content="width=device-width, initial-scale=1.0"
			/>
			<title>${title}</title>
			<script src="https://cdn.tailwindcss.com"></script>
			<script>
				tailwind.config = {
					theme: {
						extend: {
							colors: {
								primary: "#3498db",
								secondary: "#2ecc71",
								accent: "#f39c12",
							},
							fontFamily: {
								sans: ["Inter", "system-ui", "sans-serif"],
								heading: ["Roboto", "system-ui", "sans-serif"],
							},
						},
					},
				};
			</script>
			<style>
				@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap");
			</style>
		</head>
		<body
			class="bg-gray-50 text-gray-800 font-sans leading-relaxed flex flex-col min-h-screen"
		>
			<header class="bg-white shadow-sm mb-8">
				<div
					class="container mx-auto px-4 py-4 flex justify-between items-center"
				>
					<a
						href="/"
						class="text-xl font-heading font-bold text-primary hover:text-primary/80 transition-colors"
						>MCP Server</a
					>
				</div>
			</header>
			<main class="container mx-auto px-4 pb-12 flex-grow">
				${content}
			</main>
		</body>
	</html>
`;

export const homeContent = async (req: Request) => {
	return html`
		<div class="max-w-2xl mx-auto">
			<h1 class="text-3xl font-heading font-bold mb-6 text-gray-900">
				Welcome to MCP Server
			</h1>
			<p class="text-lg text-gray-600 mb-8">
				This is a simple MCP server implementation. The server is running and ready to handle requests.
			</p>
		</div>
	`;
};

// Context from the auth process, now contains sessionId instead of direct access token
export type Props = {
	sessionId: string;
};

// Upstox token response interface based on official API documentation
export interface UpstoxTokenResponse {
	email: string;
	exchanges: string[];
	products: string[];
	broker: string;
	user_id: string;
	user_name: string;
	order_types: string[];
	user_type: string;
	poa: boolean;
	is_active: boolean;
	access_token: string;
	extended_token: string;
}

// Session data stored in KV
export interface SessionData {
	accessToken: string;
	email: string;
	userId: string;
	userName: string;
	createdAt: number;
}

// Utility to get session data from KV using session ID
export async function getSessionData(sessionId: string, kv: KVNamespace): Promise<SessionData | null> {
	try {
		const sessionDataStr = await kv.get(`session:${sessionId}`);
		if (!sessionDataStr) {
			return null;
		}
		return JSON.parse(sessionDataStr) as SessionData;
	} catch (error) {
		console.error('Error retrieving session data:', error);
		return null;
	}
}

// Utility to validate and get access token from session
export async function getAccessTokenFromSession(sessionId: string, kv: KVNamespace): Promise<string | null> {
	const sessionData = await getSessionData(sessionId, kv);
	return sessionData?.accessToken || null;
}

// Helper function to extract KV from various possible sources in the extra context
export function getKVFromContext(extra: { [key: string]: unknown }): KVNamespace | null {
	// Try to get from extra.env first (direct environment access)
	if (extra.env && typeof extra.env === 'object' && 'OAUTH_KV' in extra.env) {
		return (extra.env as Env).OAUTH_KV;
	}
	
	// Try to get from the OAuth context (when called via OAuth provider)
	if (extra.context && typeof extra.context === 'object') {
		const context = extra.context as any;
		if (context.env && context.env.OAUTH_KV) {
			return context.env.OAUTH_KV;
		}
	}
	
	// Try to get from extra directly (if OAuth provider passes it directly)
	if ('OAUTH_KV' in extra) {
		return extra.OAUTH_KV as KVNamespace;
	}
	
	// Try to get from request context (OAuth provider pattern)
	if (extra.request && typeof extra.request === 'object') {
		const request = extra.request as any;
		if (request.env && request.env.OAUTH_KV) {
			return request.env.OAUTH_KV;
		}
	}
	
	// Try to get from global context if available
	if (typeof globalThis !== 'undefined' && 'OAUTH_KV' in globalThis) {
		return (globalThis as any).OAUTH_KV;
	}
	
	return null;
}

export function getUpstreamAuthorizeUrl({
	client_id,
	redirect_uri,
	state,
	upstream_url,
}: {
	client_id: string;
	redirect_uri: string;
	state: string;
	upstream_url: string;
}): string {
	const url = new URL(upstream_url);
	url.searchParams.append("client_id", client_id);
	url.searchParams.append("redirect_uri", redirect_uri);
	url.searchParams.append("response_type", "code");
	url.searchParams.append("state", state);
	return url.toString();
}

export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
}): Promise<[string, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	const grant_type = "authorization_code";
	const resp = await fetch(upstream_url, {
		body: new URLSearchParams({ client_id, client_secret, code, redirect_uri, grant_type }).toString(),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Accept": "application/json",
		},
		method: "POST",
	});
	if (!resp.ok) {
		const errorText = await resp.text();
		console.error("Upstox token request failed:", errorText);
		return [null, new Response("Failed to fetch access token", { status: 500 })];
	}
	
	const body = await resp.json() as UpstoxTokenResponse;
	if (!body.access_token) {
		console.error("Upstox token response missing access_token:", body);
		return [null, new Response("Missing access token", { status: 400 })];
	}
	
	console.log("Successfully obtained Upstox token for user:", body.user_id);
	return [JSON.stringify(body), null];
}
