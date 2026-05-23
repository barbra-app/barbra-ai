# Barbra

> *The window won't wait. The Barbra way.*

AI-powered media intelligence — a chat interface over [Master Metrics](https://mastermetrics.com) that lets you select client accounts and campaigns, then ask Claude questions and get back **live charts, KPI cards, and tables** (generative UI), not just text.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind v4 (CSS-first config in `app/globals.css`) |
| AI runtime | [Vercel AI SDK v6](https://ai-sdk.dev) — `streamText`, multi-step tool use |
| Model | Claude Opus 4.7 via `@ai-sdk/anthropic` |
| Data | Master Metrics MCP (`experimental_createMCPClient`) — currently mocked, see [Wiring real MCP](#wiring-real-mcp) |
| Charts | Recharts |
| Fonts | Bricolage Grotesque (display) + Inter (UI), via `next/font/google` |

## Design system

Extracted from [barbra.com.co](https://www.barbra.com.co):

- **Surfaces** — `#0A0A0A` shell, `#131313` cards, `#1F1F1F` borders
- **Foreground** — `#FAFAFA` text, `#A1A1A1` muted, `#6B6B6B` subtle
- **Brand**
  - Spark yellow `#F5C842` (the 4-point asterisk mark)
  - Lemon highlight `#E8FF6B` (the underline emphasis on the landing)
  - Electric royal blue `#1E40FF` (primary CTA)
  - Sage green `#9DD89C` (secondary accent / positive tone)
- **Type** — rounded geometric sans, tight tracking on display
- **Radius** — fully rounded pills for CTAs, `14px` cards

All tokens live as CSS custom properties under `@theme` in [app/globals.css](app/globals.css).

## Getting started

```bash
pnpm install   # or npm / yarn / bun
pnpm dev
```

Open http://localhost:3000.

You'll need `ANTHROPIC_API_KEY` in `.env.local`. The repo ships with a placeholder — **rotate the key in `.env.local` before pushing**, and never commit `.env.local`.

## Wiring real MCP

The app starts with `USE_MOCK_MCP=true` so the whole flow (sidebar → chat → tool call → generative UI) works without external dependencies. The mock layer lives in [`lib/mcp/mock-data.ts`](lib/mcp/mock-data.ts) and exposes four tools defined in [`lib/ai/tools.ts`](lib/ai/tools.ts):

- `list_accounts` — clients in your workspace
- `list_campaigns` — campaigns for an account, filterable by channel/status
- `get_kpi_summary` — spend, ROAS, CPA, CTR, CVR, conversions over N days
- `get_time_series` — daily series of a chosen metric for one or more campaigns

**To connect the real Master Metrics MCP server:**

1. Grab your MCP connection config from the Master Metrics dashboard.
2. Put the URL and bearer token into `.env.local`:
   ```bash
   MASTERMETRICS_MCP_URL=https://mcp.mastermetrics.com/sse
   MASTERMETRICS_MCP_TOKEN=mm_live_...
   USE_MOCK_MCP=false
   ```
3. Open [`lib/mcp/client.ts`](lib/mcp/client.ts) and uncomment the `experimental_createMCPClient` block (instructions in the file). The returned tools merge with `barbraTools` automatically in [`app/api/chat/route.ts`](app/api/chat/route.ts).

If MM's tool names match ours (`list_accounts`, etc.), the UI keeps working unchanged. If they're different (e.g. `mm_accounts_list`), either alias them in `client.ts` or extend [`components/chat/chat-panel.tsx`](components/chat/chat-panel.tsx) `ToolResult` switch to dispatch the new shapes.

## Project layout

```
app/
  api/chat/route.ts        Claude + tools, streamed via AI SDK v6
  layout.tsx               Fonts + global shell
  page.tsx                 Sidebar + chat
  globals.css              Design tokens (Tailwind v4 @theme)
components/
  layout/                  BrandMark, Sidebar
  chat/                    ChatPanel + message + tool routing
  generative/              KPI cards, line chart, campaign table, account grid
lib/
  ai/tools.ts              Tool definitions exposed to Claude
  mcp/                     MCP client + mock data
  utils.ts                 cn(), formatters
```

## Deployment

This repo deploys to Vercel. Set the env vars (`ANTHROPIC_API_KEY`, `MASTERMETRICS_MCP_URL`, `MASTERMETRICS_MCP_TOKEN`, `USE_MOCK_MCP`) in the Vercel project settings, then push to `main`.
