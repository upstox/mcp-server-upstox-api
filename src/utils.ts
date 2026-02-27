// Helper to generate the layout
import { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { marked } from "marked";
import { ToolResponse } from "./types";
import { ERROR_MESSAGES } from "./constants";

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




// Updated utility to get and validate session data from KV
export async function getValidSessionData(
	sessionId: string, 
	kv: KVNamespace,
): Promise<SessionData | null> {
	try {
		const sessionDataStr = await kv.get(`session:${sessionId}`);
		if (!sessionDataStr) {
			return null;
		}
		
		const sessionData = JSON.parse(sessionDataStr) as SessionData;
				
		return sessionData;
	} catch (error) {
		console.error('Error retrieving session data:', error);
		return null;
	}
}



// Updated utility to validate and get access token from session
export async function getAccessTokenFromSession(
	sessionId: string, 
	kv: KVNamespace
): Promise<string | null> {
	const sessionData = await getValidSessionData(sessionId, kv);
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
			text: "Authentication required: Your Upstox session has expired. Please re-authenticate to continue."
		}],
		isError: true,
		metadata: {
			errorType: "AUTHENTICATION_EXPIRED",
			requiresReauth: true
		}
	};
}

export function createAuthenticationInvalidError(): ToolResponse {
	return {
		content: [{
			type: "text",
			text: "Authorization failed: You do not have permission to access this resource. Please check your Upstox account permissions."
		}],
		isError: true,
		metadata: {
			errorType: "AUTHENTICATION_INVALID",
			requiresReauth: false
		}
	};
}

/**
 * Handles non-OK Upstox API responses.
 * - Returns null if the response is OK (caller should proceed normally).
 * - Returns a ToolResponse for auth errors (401/403) so callers can propagate them cleanly.
 *   - 401: session is deleted from KV and an expiry error is returned.
 *   - 403: a permission error is returned without touching the session.
 * - Throws for all other non-OK responses, to be caught by upper-level error handling.
 */
export async function handleUpstoxApiResponse(
	response: Response,
	sessionId: string,
	kv: KVNamespace,
): Promise<ToolResponse | null> {
	if (response.ok) return null;
	if (response.status === 401) {
		console.log(`Session ${sessionId} expired (401), clearing session from KV`);
		await kv.delete(`session:${sessionId}`);
		return createAuthenticationExpiredError();
	}
	if (response.status === 403) {
		return createAuthenticationInvalidError();
	}
	console.error(`Upstox API error: ${response.status} ${response.statusText}`);
	throw new Error(ERROR_MESSAGES.API_ERROR);
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

/**
 * Calculate TTL in seconds until the next 3:30 AM IST
 * 
 * This function calculates the time remaining until the next occurrence of 3:30 AM
 * in Indian Standard Time (IST). If the current time is already past 3:30 AM IST
 * today, it will calculate the time until 3:30 AM IST tomorrow.
 * 
 * @returns {number} The number of seconds until the next 3:30 AM IST
 * @throws {Error} If the calculated TTL is negative or invalid
 */
export function getTTLUntil330AMIST(): number {
	try {
		// Get current time in IST using proper timezone handling
		const now = new Date();
		const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
		
		// Create target time: 3:30 AM IST today
		const targetIST = new Date(nowIST);
		targetIST.setHours(3, 30, 0, 0);
		
		// If current time is already past 3:30 AM IST today, set target to tomorrow
		if (targetIST.getTime() <= nowIST.getTime()) {
			targetIST.setDate(targetIST.getDate() + 1);
		}
		
		// Calculate difference in milliseconds and convert to seconds
		const diffMs = targetIST.getTime() - nowIST.getTime();
		const diffSeconds = Math.floor(diffMs / 1000);
		
		// Validate the result
		if (diffSeconds <= 0) {
			throw new Error(`Invalid TTL calculated: ${diffSeconds} seconds`);
		}

		console.log(`[TTL Calculator] TTL seconds: ${diffSeconds} (${Math.round(diffSeconds / 3600 * 100) / 100} hours)`);
		
		// CF Worker KV TTL must be at least 60 seconds
		return Math.max(60, diffSeconds);
		
	} catch (error) {
		console.error('[TTL Calculator] Error calculating TTL:', error);
		// Fallback: return 24 hours if calculation fails
		const fallbackTTL = 24 * 60 * 60; // 24 hours in seconds
		console.warn(`[TTL Calculator] Using fallback TTL: ${fallbackTTL} seconds (24 hours)`);
		return fallbackTTL;
	}
}