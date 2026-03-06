# Copilot Instructions for fetcher-mcp

## Project Overview

`fetcher-mcp` is a **Model Context Protocol (MCP) server** that fetches web page content using a Playwright headless Chromium browser. It exposes two MCP tools (`fetch_url`, `fetch_urls`) and supports two transport protocols: **stdio** (default) and **HTTP/SSE**.

The server is written in **TypeScript (ESM)**, compiled to `build/` with `tsc`, and published to npm as `fetcher-mcp`.

---

## Architecture

```
src/
├── index.ts                  # Entry point — wires config, transport, and server
├── server.ts                 # Creates MCP Server, registers tool handlers
├── config/
│   ├── args.ts               # CLI argument parsing (--transport, --port, --host, --debug)
│   └── index.ts              # Exports getConfig(), isDebugMode()
├── tools/
│   ├── fetchUrl.ts           # fetch_url tool definition + handler (single URL)
│   ├── fetchUrls.ts          # fetch_urls tool definition + handler (concurrent URLs)
│   └── index.ts              # Re-exports tools[] and toolHandlers map
├── services/
│   ├── browserService.ts     # Playwright browser/context/page lifecycle + stealth
│   └── webContentProcessor.ts# Page navigation, stability check, Readability + Turndown
├── transports/
│   ├── stdio.ts              # StdioTransportProvider
│   ├── http.ts               # HttpTransportProvider (Streamable HTTP + SSE via Express)
│   ├── index.ts              # createTransportProvider() factory
│   └── types.ts              # TransportConfig, TransportProvider, HttpSession interfaces
├── types/
│   └── index.ts              # FetchOptions, FetchResult interfaces
└── utils/
    └── logger.ts             # Unified logger (writes to stderr so stdout stays clean for stdio)
```

---

## Key Design Decisions

### Transport Modes
- **stdio** (default): Used when integrated into AI clients like Claude Desktop. All MCP messages flow over stdin/stdout. The logger **must** write to **stderr only** to avoid corrupting the MCP stream.
- **HTTP**: Starts an Express server exposing `/mcp` (Streamable HTTP) and `/sse` (legacy SSE). Activated with `--transport=http`.

### Browser / Stealth
`BrowserService` manages Playwright Chromium with anti-bot-detection measures:
- Randomised user agents and viewport sizes
- `navigator.webdriver` override via `addInitScript`
- Custom HTTP headers (Accept, Sec-Fetch-*, etc.)
- `--disable-blink-features=AutomationControlled` launch flag
- Media blocking (`image | stylesheet | font | media`) when `disableMedia: true`

**Critical Docker flags** — must remain in the Chromium launch args to prevent page crashes:
- `--disable-gpu` — prevents GPU-related crashes in headless containers with no GPU
- `--disable-software-rasterizer` — avoids falling back to a software rasterizer that can OOM
- `--no-zygote` — disables the Chromium zygote launcher process that crashes inside Docker namespaces
- `--disable-dev-shm-usage` — tells Chromium to write to `/tmp` when `/dev/shm` is small

> **Note:** Even with `--disable-dev-shm-usage`, complex pages can still crash if the container's
> `/dev/shm` is tiny (Docker default is 64 MB). Always set `shm_size: '2g'` in `docker-compose.yml`.

Each call to `fetch_url` creates and destroys its own browser instance. `fetch_urls` reuses one browser but creates a page per URL, running all fetches concurrently with `Promise.all`.

### Content Processing
`WebContentProcessor` pipeline:
1. `page.goto()` with configurable `waitUntil` and `timeout`
2. Optional `waitForNavigation` for anti-bot redirects
3. `ensurePageStability()` — waits for `document.readyState === 'complete'` + 500 ms pause
4. `safelyGetPageInfo()` — retries up to 3× on "Execution context was destroyed" errors
5. If `extractContent: true` → **@mozilla/readability** strips boilerplate
6. If `returnHtml: false` (default) → **turndown** converts to Markdown
7. Output format: `Title: …\nURL: …\nContent:\n\n…`

### Error Handling
- Timeout during `goto()` → attempts to extract whatever HTML is available before re-throwing
- All errors are caught and returned as structured `FetchResult` with `success: false` and an `<error>…</error>` content block (never throws to the MCP caller)

---

## FetchOptions Interface

```typescript
interface FetchOptions {
  timeout: number;           // ms, default 30000
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'; // default 'load'
  extractContent: boolean;   // Readability extraction, default true
  maxLength: number;         // 0 = unlimited
  returnHtml: boolean;       // false = Markdown output
  waitForNavigation: boolean;// wait for post-load redirect, default false
  navigationTimeout: number; // ms, default 10000
  disableMedia: boolean;     // block images/css/fonts/media, default true
  debug?: boolean;           // show browser window, overrides --debug flag
}
```

---

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--transport=http` | stdio | Switch to HTTP transport |
| `--port=N` | 3000 | HTTP server port |
| `--host=X` | localhost | HTTP server bind address |
| `--debug` | false | Show Chromium window for all requests |
| `--log` | false | Enable file/console logging |

---

## Development Workflow

```bash
npm install
npm run build          # tsc compile → build/
npm run watch          # tsc --watch
npm run inspector      # Build + launch MCP inspector
npm run install-browser # Install Chromium for Playwright
```

Build output goes to `build/`. The entry binary is `build/index.js` (chmod 755 post-build).

TypeScript config: `tsconfig.json` — ESM module output targeting Node.js.

---

## Adding a New Tool

1. Create `src/tools/myTool.ts` exporting:
   - `myToolTool` — the tool definition object (`name`, `description`, `inputSchema`)
   - `myTool(args: any)` — the async handler returning `{ content: [{ type: "text", text: string }] }`
2. Register in `src/tools/index.ts`:
   - Add to `tools` array
   - Add to `toolHandlers` map
3. Use `BrowserService` + `WebContentProcessor` for any browser-based work.
4. Reuse `FetchOptions` or extend `src/types/index.ts` for new option types.

---

## Coding Conventions

- **TypeScript strict mode** — avoid `any` where possible; use proper types from `src/types/`.
- **ESM imports** — always use `.js` extension in import paths (e.g. `"./utils/logger.js"`).
- **Logger** — use `logger.info/warn/error/debug` from `src/utils/logger.ts`; never use `console.log` (breaks stdio transport).
- **Resource cleanup** — always close browser/page in `finally` blocks; debug mode intentionally skips cleanup.
- **Async errors** — catch and return structured errors; do not let unhandled rejections surface to the MCP caller.
- **Tool handlers** — must return `{ content: [{ type: "text", text: string }] }`.

---

## Docker

```bash
docker run -p 3000:3000 ghcr.io/tekgnosis-net/fetcher-mcp:latest
# or
docker compose up
```

The `Dockerfile` installs Playwright dependencies and Chromium. The default command starts HTTP transport on port 3000.

**`docker-compose.yml` must include `shm_size: '2g'`.**  
Docker containers default to 64 MB of `/dev/shm`. Chromium uses shared memory for inter-process communication between the browser, renderer, and GPU processes. Without sufficient shared memory, Chromium renderer processes crash instantly on heavy JS pages (SPAs, media-heavy sites, paywalled articles). The symptom is `page.goto: Page crashed` in the logs with no further stack trace.

```yaml
services:
  fetcher-mcp:
    image: ghcr.io/tekgnosis-net/fetcher-mcp:latest
    shm_size: '2g'   # REQUIRED — prevents Chromium renderer crashes
    ports:
      - "8098:3000"
```

---

## Testing

No automated test suite exists yet. Manual testing:
- Use `npm run inspector` to open the MCP Inspector UI.
- Use `--debug` flag to visually inspect browser behaviour.
- For HTTP transport, test with curl against `/mcp` and `/sse` endpoints.
