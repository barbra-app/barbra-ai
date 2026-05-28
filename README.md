# Agency Hub

Multi-tool platform for a marketing agency where clients can self-manage and use agency tools. This first version ships:

- Email/password authentication with role-based access (`client` / `admin`).
- A **trackable QR code generator** that builds UTM-tagged URLs and measures scans through a short redirect.
- Foundations (atomic design, layered services, i18n, RLS) for adding more tools incrementally — including the planned Mastermetrics MCP integration.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS only — every component hand-built |
| Auth & DB | Supabase (Postgres + Auth + Row Level Security) |
| Storage | Cloudinary (QR images and any other uploaded assets) |
| i18n | Lightweight cookie-based, custom (`en`, `es`) — no extra dependency |
| Package manager | pnpm |

## Project layout

```
app/                  Next.js routes (thin: compose templates, call services)
  actions/            Server actions per domain
  r/[slug]/           Public tracking redirect
components/           Atomic Design — atoms, molecules, organisms, templates
services/             Talks to Supabase, Cloudinary, external APIs (no React)
lib/                  Pure utilities (UTM, slug, QR render, formatters)
  supabase/           Server, browser and middleware Supabase clients
hooks/                Client-side React hooks
i18n/                 Locale config, server reader, client provider, JSON dicts
types/                DB row + domain types
supabase/migrations/  SQL migrations (schema + RLS)
middleware.ts         Session refresh + role-based route gating
```

### Architectural rules

- React components **never** call Supabase or Cloudinary directly. They call a service (server side) or a server action (from client components).
- `services/*` is server-only (`import "server-only";`). Pure helpers live in `lib/*`.
- `services/auth.ts` exports `getCurrentUser()` / `requireUser()` / `requireAdmin()` so pages get a typed user without dealing with cookies.
- All user-facing strings are keyed translations under `i18n/locales/*.json`. No hard-coded copy.

## Running locally

```bash
pnpm install
cp .env.example .env.local      # then fill in the values below
pnpm dev
```

### Required environment variables

| Var | Where it's used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | building tracking URLs (e.g. `https://app/r/<slug>`) | use `http://localhost:3000` in dev |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase clients (browser, server, middleware) | from Supabase Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase clients (anon) | same place |
| `SUPABASE_SERVICE_ROLE_KEY` | redirect endpoint scan inserts | **server-only**, never exposed to the browser |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | QR uploads | server-only |
| `CLOUDINARY_QR_FOLDER` (optional) | Cloudinary folder for QR uploads | defaults to `qr-codes` |

## Database setup

Migrations live in `supabase/migrations/`. Apply them with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

…or paste the two files manually into the SQL editor in this order:

1. `0001_initial_schema.sql` — types, tables, indexes, `handle_new_user` + `updated_at` triggers.
2. `0002_rls_policies.sql` — RLS policies and the `is_admin()` helper.

### Promoting a user to admin

Self-serve registration creates a `client`. To promote someone:

```sql
update profiles set role = 'admin' where id = '<auth_user_uuid>';
```

### Tables (summary)

- `profiles (id → auth.users, role user_role, full_name, timestamps)`
- `qr_codes (id, owner_id → profiles, name, destination_url, utm_*, slug, final_url, image_url, image_public_id, timestamps)`
- `qr_scans (id, qr_code_id → qr_codes, scanned_at, user_agent, referrer, country)`

RLS: clients can only read/write rows they own. Admins read everything via `is_admin()`. Scan inserts come from the redirect handler using the service role key, so no insert policy is needed on `qr_scans`.

## Feature: trackable QR codes

1. Client opens **Dashboard → New QR code**, fills in name, destination URL, UTM params and optionally a custom slug.
2. `services/qr-codes.createQrCode`:
   - validates inputs and reserves a unique slug,
   - builds the UTM-tagged `final_url`,
   - renders a QR PNG encoding the **short** tracking URL (so all scans funnel through `/r/<slug>`),
   - uploads the PNG to Cloudinary,
   - inserts the row in `qr_codes` (RLS enforces ownership).
3. Scanning the QR hits `app/r/[slug]/route.ts`, which:
   - resolves the slug via `services/tracking.resolveSlugToTarget`,
   - fire-and-forget inserts a `qr_scans` row (never blocks the redirect),
   - 302s to `final_url`.
4. The detail page shows total scans, a 14-day chart, the recent-scan table, and copyable short/final URLs.

## Auth flow

- `/login` and `/register` are public; everything else is gated by `middleware.ts`.
- The middleware refreshes Supabase cookies on every request and redirects:
  - anonymous users → `/login?next=…`
  - non-admin users hitting `/admin/*` → `/dashboard`
- `services/auth.signInWithPassword` wraps Supabase Auth; adding Google later is `supabase.auth.signInWithOAuth({ provider: 'google' })` in the same module — callers don't change.

## i18n

- Translation files: `i18n/locales/{en,es}.json`. Add a locale by adding another JSON file and appending it to `LOCALES` in `i18n/config.ts`.
- Server components: `const { t } = await getTranslator();`.
- Client components: wrapped in `<I18nProvider>` at the root layout, then `const { t } = useTranslations();`.
- The visible **EN/ES** switcher (top right) writes a `locale` cookie and refreshes the route.

## Extending the platform

The folder structure scales by domain. To add a new tool (say "ad-account-audit"):

1. Add SQL: `supabase/migrations/000N_ad_audit.sql` (table + RLS).
2. Add types: `types/database.ts` and `types/domain.ts`.
3. Add a service module: `services/ad-audit.ts` (`import "server-only";`).
4. Add a route: `app/dashboard/ad-audit/...`.
5. Add organisms/molecules in `components/...`.
6. Translate copy in `i18n/locales/*.json`.

### Mastermetrics MCP — where it will plug in

The planned integration brings a Mastermetrics MCP server so clients can ask natural-language questions about their campaigns and get generative-UI answers. When that lands:

- The MCP **server** runs out-of-process; this app talks to it over the MCP protocol from a new service module (`services/mastermetrics.ts`).
- The chat UI lives at `app/dashboard/insights/` and uses streaming server actions to call the service.
- Server actions stream tool results back, and the UI maps each tool result type to a small React renderer in `components/organisms/insights/*` — that's the "generative UI" surface.
- Auth and per-client data scoping stay in this app: the service authenticates the user via `getCurrentUser()` and includes the user's account scope in every MCP call.

No code for the MCP integration is included in this initial pass — only the seams (folder shape, services pattern, auth helper) are in place.
