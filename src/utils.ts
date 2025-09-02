// Helper to generate the layout
import { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { marked } from "marked";
import { ToolResponse } from "./types";

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

// Session data stored in KV
export interface SessionData {
	accessToken: string;
	email: string;
	userId: string;
	userName: string;
	createdAt: number;
	clientId: string; 
}

// Session validity duration in seconds (1 hour)
export const SESSION_VALIDITY_DURATION = 60 * 60; // 1 hour

// Utility to validate session based on creation time
export function isSessionValid(sessionData: SessionData): boolean {
	const now = Date.now();
	const sessionAge = now - sessionData.createdAt;
	console.log(`Session age: ${sessionAge / 1000} seconds for userId: ${sessionData.userId}`);
	return sessionAge / 1000 < SESSION_VALIDITY_DURATION;
}

// Helper function to clean up expired session and related OAuth data
export async function cleanupExpiredSession(
	sessionId: string, 
	sessionData: SessionData,
	kv: KVNamespace,
	oauthProvider: OAuthHelpers
): Promise<void> {
	try {
		// Delete session KV pair
		await kv.delete(`session:${sessionId}`);
		
		// Revoke all grants for the user
		if (sessionData.userId) {
			const grantsResult = await oauthProvider.listUserGrants(sessionData.userId);
			const allGrantIds = grantsResult.items.map((grant: any) => grant.id);
			
			// Revoke each grant
			for (const grantId of allGrantIds) {
				try {
					await oauthProvider.revokeGrant(grantId, sessionData.userId);
					console.log(`Successfully revoked grant ${grantId} for user ${sessionData.userId}`);
				} catch (error) {
					console.error(`Error revoking grant ${grantId}:`, error);
				}
			}
		}
		
		// Delete client
		if (sessionData.clientId) {
			await oauthProvider.deleteClient(sessionData.clientId);
			console.log(`Successfully deleted client ${sessionData.clientId}`);
		}
		
		console.log("Successfully cleaned up expired session");
	} catch (error) {
		console.error("Error cleaning up expired session:", error);
	}
}

// Updated utility to get and validate session data from KV
export async function getValidSessionData(
	sessionId: string, 
	kv: KVNamespace,
	oauthProvider?: any
): Promise<SessionData | null> {
	try {
		const sessionDataStr = await kv.get(`session:${sessionId}`);
		if (!sessionDataStr) {
			return null;
		}
		
		const sessionData = JSON.parse(sessionDataStr) as SessionData;
		
		// Check if session is still valid
		if (!isSessionValid(sessionData)) {
			console.log(`Session ${sessionId} has expired, cleaning up...`);
			
			// Clean up expired session if OAuth provider is available
			if (oauthProvider) {
				await cleanupExpiredSession(sessionId, sessionData, kv, oauthProvider);
			}
			
			return null;
		}
		
		return sessionData;
	} catch (error) {
		console.error('Error retrieving session data:', error);
		return null;
	}
}



// Updated utility to validate and get access token from session
export async function getAccessTokenFromSession(
	sessionId: string, 
	kv: KVNamespace,
	oauthProvider?: any
): Promise<string | null> {
	const sessionData = await getValidSessionData(sessionId, kv, oauthProvider);
	return sessionData?.accessToken || null;
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
		console.log(await resp.text());
		return [null, new Response("Failed to fetch access token", { status: 500 })];
	}
	const body = await resp.json() as { access_token?: string };
	if (!body.access_token) {
		return [null, new Response("Missing access token", { status: 400 })];
	}
	return [JSON.stringify(body), null];
}

// Authentication error utility functions
export function createSessionNotFoundError(): ToolResponse {
	return {
		content: [{
			type: "text",
			text: "Error: No session ID found. Please authenticate first."
		}],
		isError: true,
		metadata: {
			errorType: "AUTHENTICATION_EXPIRED",
			requiresReauth: true
		}
	};
}

export function createAuthenticationExpiredError(): ToolResponse {
	return {
		content: [{
			type: "text",
			text: "Error: Session expired or invalid. Please re-authenticate."
		}],
		isError: true,
		metadata: {
			errorType: "AUTHENTICATION_EXPIRED",
			requiresReauth: true
		}
	};
}

export function createKVNotAvailableError(): ToolResponse {
	return {
		content: [{
			type: "text",
			text: "Error: KV store not available."
		}],
		isError: true,
		metadata: {
			errorType: "API_ERROR"
		}
	};
}
