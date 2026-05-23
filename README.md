# Barbra

> *The window won't wait. The Barbra way.*

AI-powered media intelligence — a chat interface over [Master Metrics](https://mastermetrics.com) that lets you pick a data source and accounts, then ask Claude questions and get back **live charts, KPI tiles, and tables** (generative UI), not just text.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind v4 (CSS-first config in `app/globals.css`) |
| AI runtime | [Vercel AI SDK v6](https://ai-sdk.dev) — `streamText`, multi-step tool use |
| Model | Claude Opus 4.7 via `@ai-sdk/anthropic` |
| MCP | Master Metrics via `@ai-sdk/mcp` over Streamable HTTP |
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

All tokens live as CSS custom properties under `@theme` in [app/globals.css](app/globals.css).

## Getting started

```bash
pnpm install
pnpm dev    # → http://localhost:3000
```

You'll need `ANTHROPIC_API_KEY` in `.env.local`. To use real Master Metrics data, also set `MASTERMETRICS_MCP_TOKEN` and flip `USE_MOCK_MCP=false` (see below).

## Master Metrics MCP

The Master Metrics MCP server lives at **`https://api.mastermetrics.com/api/v2/mcp`** and supports two auth methods:

- **OAuth 2.0** (RFC 6749 + PKCE S256, dynamic client registration via RFC 7591) — used by Claude.ai directly
- **API key** — `Authorization: Bearer prefix.your_secret` — what we use for backend-to-MCP integration

**To connect real MM data:**

1. Generate an API key in your Master Metrics dashboard (format `prefix.your_secret`).
2. Set in `.env.local`:
   ```
   MASTERMETRICS_MCP_TOKEN=mm_xxx.yyy
   USE_MOCK_MCP=false
   ```
3. Restart `pnpm dev`. The chat now runs against your real org's data.

### MM's MCP tool surface (mirrored by our mocks)

| Tool | Use |
|---|---|
| `health_check` | Server status |
| `get_available_sources` | List sources connected to the org (meta, google, tiktok, linkedin, shopify, …) |
| `get_accounts(source)` | List ad accounts for a source |
| `get_metrics(source)` | Available metrics (spend, clicks, ctr, roas, …) |
| `get_dimensions(source)` | Available breakdowns (date, campaign_name, country, device, …) |
| `get_dates(source)` | Date-field options (CRM sources only — Kommo, HubSpot, etc.) |
| `get_data({ source, accounts, metrics, breakdowns, since, until, tileData? })` | Execute a query, return tabular rows |
| `get_dashboards`, `get_dashboard_public_links`, `create_dashboard_public_link` | Dashboard sharing |

The model is taught (in the system prompt at [`app/api/chat/route.ts`](app/api/chat/route.ts)) to chain `get_available_sources` → `get_accounts` → `get_metrics`/`get_dimensions` → `get_data`, with `tileData: true` for headline numbers and `breakdowns: ["date"]` (plus optional second dimension) for trends and breakdowns.

### Mock vs real

When `USE_MOCK_MCP=true` (or no token is set), [`lib/ai/tools.ts`](lib/ai/tools.ts) supplies a local implementation of all MM tools with deterministic synthetic data ([`lib/mcp/mock-data.ts`](lib/mcp/mock-data.ts)). The tool *names and shapes* match what the real MM server returns, so flipping to real MCP requires zero UI changes — just env vars.

## Generative UI

The chat panel dispatches by tool name. Each MM tool gets a dedicated component, and `get_data` is smart about its layout:

| Tool result | Renderer |
|---|---|
| `get_available_sources` | `<SourcesGrid>` — color-coded source cards |
| `get_accounts` | `<AccountsTable>` |
| `get_metrics` / `get_dimensions` / `get_dates` | `<DiscoveryChips>` — typed badges |
| `get_data` with `tileData: true` | **KPI tile grid** (4–8 metric tiles) |
| `get_data` with date + ≥1 metric | **Recharts line chart** (multi-series if a non-date breakdown exists) |
| `get_data` otherwise | **Scrollable table** with metric-aware formatting |
| Unknown tools | Collapsible raw JSON |

Output normalization lives in [`lib/mcp/normalize.ts`](lib/mcp/normalize.ts) — it handles MCP content blocks, stringified JSON, and various row-array key names (`rows`/`data`/`items`/`results`), so the UI is resilient to small shape drift between MM's real responses and our mock.

## Project layout

```
app/
  api/chat/route.ts        Claude + MM tools, streamed via AI SDK v6
  layout.tsx               Fonts + global shell
  page.tsx                 Sidebar + chat
  globals.css              Design tokens (Tailwind v4 @theme)
components/
  layout/                  BrandMark, Sidebar (sources → accounts)
  chat/                    ChatPanel + message + tool dispatch
  generative/              sources-grid, accounts-table, discovery-chips, data-result
lib/
  ai/tools.ts              Mock implementation of MM's MCP tools
  mcp/
    client.ts              Real MCP client (createMCPClient) + mock fallback
    mock-data.ts           Deterministic synthetic data
    normalize.ts           MCP output normalization
  utils.ts                 cn(), formatters
```

## Deployment

This repo deploys to Vercel. Set the env vars (`ANTHROPIC_API_KEY`, `MASTERMETRICS_MCP_URL`, `MASTERMETRICS_MCP_TOKEN`, `USE_MOCK_MCP`) in the Vercel project settings, then push to `main`.
