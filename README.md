# Onextel Agent Cloud

Enterprise control plane for **Meta Business Agents on WhatsApp** — multi-tenant, role-based, with number onboarding, knowledge, skills, API connector tools, evaluation and governed rollout.

Built for **GitHub → Vercel → Supabase**.

---

## 1. What it does

| Module | Capability |
|---|---|
| **Auth & RBAC** | Supabase Auth (email + password), 4 roles: platform admin, tenant admin, operator, viewer. Cookie session, middleware-protected routes. |
| **Tenants** | Isolated workspaces. Platform admins see every tenant and every agent; tenant admins only their own. |
| **Numbers** | Provision through Onextel, register with Meta (`/register` + `agent_onboarding`), quality/limit tracking, one-agent-per-number binding. |
| **Agents** | Multiple agents per tenant, each bound to a number; draft → in review → live → paused. |
| **Knowledge** | Business info, FAQs, Markdown skills pushed to `/agent_config/*`. |
| **Connectors & tools** | Register HTTPS connectors + map API endpoints (`GET/POST`, path/query/body params) as agent tools, then run them from the UI. |
| **Test console** | Sandbox chat that routes on your configured skills/tools, with tool tags + latency. |
| **Evaluation** | Regression suite, run with Meta `agent-eval`, pass-rate score. |
| **Rollout** | Publish (enable rollout), version bump, pause, audit trail. |
| **Conversations** | Live inbox, human takeover / release via `thread_control`. |
| **Admin** | Cross-tenant agent table, usage & health, append-only audit log. |
| **Credentials vault** | Write-only secrets, masked at rest, never returned by the API. |

## 2. Quick start (demo mode — no keys needed)

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with:

| Role | Email | Password |
|---|---|---|
| Platform admin | `admin@onextel.io` | `demo1234` |
| Tenant admin | `priya@airindiaexpress.in` | `demo1234` |
| Operator | `rahul@airindiaexpress.in` | `demo1234` |

Demo mode keeps state in memory (seeded with the Air India Express agent from the supplied Postman collection — 20 FAQs, 16 skills, 1 connector with 9 tools). Setting Supabase env vars switches the app to Supabase persistence + Supabase Auth; demo accounts stop working.

## 3. Supabase setup

1. Create a project at supabase.com.
2. Run `supabase/schema.sql` in the SQL editor. It creates every table, enum, index, RLS policy, signup trigger and seeds three tenants.
3. Create your first users in **Authentication → Users**, then set roles:

```sql
update public.profiles set role='platform_admin', tenant_id=null where email='you@company.com';
-- tenant user:
update public.profiles set role='tenant_admin', tenant_id='t_aix' where email='priya@airindiaexpress.in';
```

4. Copy the project URL, anon key and service-role key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
META_GRAPH_VERSION=v25.0
META_SYSTEM_USER_TOKEN=EAAG...        # platform fallback token
META_VERIFY_TOKEN=your-webhook-token
```

## 4. Deploy on Vercel

```bash
git init && git add -A && git commit -m "Onextel Agent Cloud"
gh repo create onextel-agent-cloud --private --source=. --push
vercel --prod    # add the env vars in the Vercel dashboard
```

Then in **Meta App Dashboard → WhatsApp → Configuration** set the callback URL to
`https://<your-app>.vercel.app/api/webhook` and the verify token to `META_VERIFY_TOKEN`.

## 5. Graph API surface implemented

All calls live in `src/lib/meta.ts`, `X-API-Version` matching Meta's samples.

| UI action | Graph call |
|---|---|
| Register number | `POST /v25.0/{entity}/register` `{messaging_product, pin}` |
| Onboard agent | `POST /{entity}/agent_onboarding?channel=whatsapp` |
| Behaviour settings | `PUT /{entity}/agent_config/settings?agent_id=` |
| Business info | `PUT /{entity}/agent_config/business_info` |
| FAQ | `POST /{entity}/agent_config/faq` |
| Skill | `POST /{entity}/agent_config/skills?agent_id=` |
| Connector | `POST /{entity}/agent_connectors` |
| Tool | `POST /{entity}/agent_connectors/{connectorId}/tools` |
| Run tool | `POST /{entity}/agent_connectors/{cId}/tools/{tId}/run` |
| Delete tool | `DELETE /{entity}/agent_connectors/{cId}/tools/{tId}` |
| Publish | `PUT /agent_config/settings` with `rollout.enabled = true` |
| Human takeover | `POST /business/whatsapp/phone_numbers/{entity}/thread_control` |
| Evaluation | `GET/POST /{entity}/agent-eval/*` |

Without a Meta token every action still works in **config-only / simulated** mode and is recorded in the audit log, so you can build and demo the whole platform before connecting production credentials.

## 6. Architecture

```
src/
  app/
    (app)/                 authenticated shell: dashboard, agents, numbers, inbox,
                          analytics, team, settings, audit, admin/*
    agents/[id]/           tabbed agent workspace (overview → publish)
    api/                   REST layer, one folder per resource
    login/                 split-screen sign-in
  components/              AppShell, UI kit, icon set
  lib/
    meta.ts                Graph client + eligibility pre-flight
    demo-db.ts             in-memory store (demo mode)
    supabase-repo.ts       Supabase repository (production)
    auth.ts                dual-mode session
    seed*.ts/json          seed data extracted from the Postman collection
supabase/schema.sql        tables, RLS, triggers, seed tenants
```

**Data model choice:** agent configuration (settings, business info, FAQs, skills, connectors, tools) is stored as JSONB documents on `agents`. This keeps a full agent version atomic, mirrors the Graph API's document-oriented config, and avoids a dozen join tables for a v1.

**Isolation:** enforced twice — in the API layer (`scopeOf()` on every request) and by Postgres row-level security (`is_platform_admin()` / `current_tenant()`).

**Security:** secrets are write-only, masked, never returned; webhook verify token checked on `hub.challenge`; security headers in `next.config.mjs`; service-role key only used server-side.

## 7. Meta requirements covered

- WhatsApp Business account + `whatsapp_business_messaging` permission.
- One agent per number (eligibility pre-flight blocks a number already running another AI agent).
- Excluded verticals surfaced in the pre-flight (Finance, Government, Health, Alcohol, Gambling, OTC drugs, Matrimony).
- Business verification + country eligibility checks.
- Handoff messages and AI audience (`EVERYONE` / `CUSTOMERS_ONLY`).

Docs: https://developers.facebook.com/documentation/meta-business-agent/overview

## 8. Roadmap hooks

- Supabase Storage for file-based knowledge uploads.
- Background job queue for eval runs and bulk FAQ sync.
- Meta embedded signup for self-serve tenant onboarding.
- Usage-based billing from `usage_daily`.

## 9. Theming

Light is the default theme; dark is one click away from the topbar toggle (persisted in `localStorage` as `mba_theme`). All colour lives in a semantic token layer at the top of `src/app/globals.css` — `--bg`, `--panel`, `--line`, `--text`, `--accent`, `--accent-fill`, `--accent-ink`, `--ok/--warn/--danger/--info` — declared twice, under `:root[data-theme='light']` and `:root[data-theme='dark']`.

Components never hard-code a hex value: soft surfaces use `color-mix(in srgb, var(--token) N%, var(--panel))`, so badges, notices, chat bubbles and status pills re-tint automatically in either theme.

To re-brand: change `--accent` (readable accent text) and `--accent-fill` (button surface) in the light block, then mirror them in the dark block.
