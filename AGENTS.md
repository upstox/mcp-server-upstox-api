# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a **Cloudflare Worker MCP server** (`upstox-mcp-server`) that integrates with the Upstox trading API via the Model Context Protocol. It is a single-service application — no separate databases or infrastructure services are needed for local dev (Wrangler emulates KV and Durable Objects locally).

### Key commands

| Action | Command |
|---|---|
| Install deps | `npm install` |
| Dev server | `npm start` (runs `wrangler dev` on port 8787) |
| Run tests | `npm test` |
| Lint | `npx @biomejs/biome@1.6.2 lint .` |
| Format | `npx @biomejs/biome@1.6.2 format --write .` |

### Non-obvious notes

- **Biome version**: `@biomejs/biome` is **not** listed in `package.json` devDependencies. The `biome.json` config targets **v1.6.2**. Always pin the version when running via npx: `npx @biomejs/biome@1.6.2 lint .`. Running without pinning pulls the latest (v2.x), which is incompatible with the config.
- **`package-lock.json` may be out of sync** with `package.json`. If `npm ci` fails, use `npm install` instead.
- **`.dev.vars`** file must exist in the project root with `UPSTOX_CLIENT_ID` and `UPSTOX_CLIENT_SECRET` for the dev server to start. Placeholder values are sufficient for server startup; real Upstox developer app credentials are needed for end-to-end OAuth testing.
- **Test suite has pre-existing failures**: 4 test files require `UPSTOX_ACCESS_TOKEN` env var (which needs a real Upstox account). The remaining 6 test files have assertion mismatches (tests expect `rejects` but handlers return error objects). These are pre-existing issues, not environment problems.
- **Root path `/` returns 404**: The `defaultHandler` (UpstoxHandler) only handles `/authorize` and `/callback`. The `app.ts` homepage route is not wired into the OAuth provider's routing. This is expected current behavior.
- **`/mcp` endpoint requires OAuth**: Returns `{"error":"invalid_token"}` without a valid bearer token. This is correct behavior.
- **Static assets**: Served from `./static/` directory (e.g., `/img/available-tools.png`).
