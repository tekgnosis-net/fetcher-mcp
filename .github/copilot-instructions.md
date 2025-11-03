# Copilot Instructions
## Big Picture
- fetcher-mcp runs an MCP server that wraps Playwright to fetch dynamic web content and expose tools via Model Context Protocol.
- Entrypoint `src/index.ts` parses CLI flags (`--transport`, `--port`, `--host`, `--debug`, `--log`) then delegates to `src/server.ts`.
- `src/server.ts` registers tool metadata from `src/tools/index.ts` and routes calls through `@modelcontextprotocol/sdk` transports.
- Fetch workflows rely on `BrowserService` + `WebContentProcessor` pairing: service boots anti-detection Chromium contexts, processor extracts or converts content.
- Google search path lives in `src/services/googleSearch.ts`, handling fingerprint spoofing, CAPTCHA fallbacks, and state persistence per query.
- HTTP transport (`src/transports/http.ts`) surfaces streamable JSON-RPC endpoints at `/mcp` and `/sse`; default is stdio via `src/transports/stdio.ts`.
## Build & Run
- Install deps with `npm install`; Playwright binaries auto-install via postinstall or `npm run install-browser` when manual control is needed.
- Compile TypeScript with `npm run build`; output goes to `build/` and chmod is applied so `fetcher-mcp` CLI points at `build/index.js`.
- Launch on stdio via `npx -y fetcher-mcp --log`; add `--transport=http --host=0.0.0.0 --port=3000` for HTTP/SSE exposing.
- Use `npm run inspector` to build then open the MCP Inspector against `build/index.js` for manual protocol debugging.
- Enable headful debugging per call with tool arg `debug: true` or globally with `--debug`; cleanup leaves browser open when debug is on.
## Implementation Notes
- Project uses Node16 ESM; always import local files with explicit `.js` suffixes and prefer named exports to avoid circular default traps.
- Preserve existing indentation and spacing when editing files; match surrounding 2-space style and avoid formatter-driven reflows.
- Respect the logger in `src/utils/logger.ts`; logs only emit when `--log` flag is passed, so avoid raw `console` calls in new code.
- Fetch tools expect `FetchOptions` and `FetchResult` contracts from `src/types/index.ts`; new behaviors should extend these types rather than ad-hoc args.
- Maintain the response envelope with Title/URL header and markdown body produced by `WebContentProcessor.processPageContent`.
- `BrowserService` randomizes UA, viewport, and blocks heavy resources when `disableMedia !== false`; reuse the shared context for multi-page workflows to avoid re-launching.
- After page work, call `browserService.cleanup`; do not close in debug mode to honour manual login flows.
- `fetchUrls` runs pages concurrently within one context; keep this pattern when expanding batch operations so fingerprints stay consistent.
- Tool registration requires updating both the exported `tools` array and `toolHandlers` map in `src/tools/index.ts`, otherwise MCP clients cannot call the tool.
- HTTP transport caches session transports keyed by `mcp-session-id`; when altering request handlers ensure initialization still routes via `handleStreamableHttpRequest`.
## Google Search Specifics
- `googleSearch` writes storage state and fingerprint JSON beside the configured `stateFile`; guard concurrent writes or reuse the multi-search helper to avoid collisions.
- CAPTCHA handling retries in headful mode; preserve fallback sequencing and avoid bypassing `performSearch(false)` unless adding explicit human-in-the-loop steps.
- Multi-query search launches a single Chromium instance and fans out via `multiGoogleSearch`; pass per-query `stateFile` suffixes to keep Google from linking sessions.
## Operational Tips
- If Playwright launch fails with missing browser, surface `BrowserNotInstalledError` and instruct callers to run the `browser_install` tool.
- Prefer streaming-friendly responses (single text block) because transports expect MCP content arrays; large payloads should be truncated using `maxLength` option.
- When adding new transports or CLI flags, thread them through `parseTransportConfig` and `getConfig` so both stdio and HTTP paths receive the update.
- Docker entry uses the published image `ghcr.io/tekgnosis-net/fetcher-mcp:latest`; match exposed port 3000 and ensure `playwright install chromium` ran inside the container.
- For debugging automation issues, combine `--debug` with `--log` to get visible browser and structured log output.
- State files default to `./browser-state.json`; clean them up when rotating fingerprints to avoid stale locales/timezones.
