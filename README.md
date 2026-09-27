# Apex - Multi-team roadmap management

[Français](README.fr.md) · **English**

Apex is a self-hosted web application to steer several project roadmaps (one per team or product manager) within a single program, with a consolidated view of health, dependencies and risks. It aims to be simple and fast, without the weight of enterprise portfolio tools.

The user interface is in French.

## Features

### Workspaces and access
- **Private instance**: people join only through an invitation link. The very first account of a new installation can register without an invitation and create the first workspace; after that, registration is closed.
- Invitation links: valid 7 days, single-use for Admin, reusable for Member, revocable at any time.
- Two roles per workspace: Admin and Member, with role changes and member removal (the last admin is protected).
- One account belongs to one workspace (multi-workspace support is planned).

### Roadmaps and items
- Roadmap creation from the dashboard (title, description, color, emoji or logo).
- Items with title, dates, status, progress and owner; timestamped status changes.
- Epic / sub-item hierarchy (one level), with automatic aggregation of dates and progress.
- Milestones, visual customization per roadmap, Excel export (items, milestones, risks, dependencies).
- Roadmap deletion reserved to admins, with confirmation.

### Gantt view
- Drag-and-drop of dates, resize handles.
- Dependency connectors drawn as Bezier curves, with a draggable handle.
- Week / Month / Quarter zoom aligned on the real calendar.
- Configurable sprint calendar band.
- Planned vs actual tracking of dates.

### Dependencies and risks
- Four dependency types (finish-to-start, start-to-start, finish-to-finish, start-to-finish, shown as FD, DD, FF, DF in the interface) and three target kinds (task, team, external system).
- Circular dependency detection, dependency summary table per roadmap.
- Risks per roadmap: impact, probability, status (open, mitigated, closed).

### Dashboard and consolidated view
- Global KPIs, "attention required" panel, health trend chart.
- Automatic health status (green, orange, red) with configurable thresholds.
- Instant filters and drill-down to each roadmap.

### AI-assisted imports (Anthropic Claude Haiku)
- Excel import: header row detection, column mapping by AI, human review before import.
- Image import (screenshot of a table or of a Gantt / swimlane view).

### Jira Cloud integration (two-way)
- Connection per workspace, API tokens encrypted with AES-256-GCM (HKDF-derived key bound to the workspace, key rotation supported).
- Project and date field mapping per roadmap, synchronization of epics, stories and "Blocks" links.
- Items are hidden (never deleted) when dates disappear or issues are removed in Jira.
- Dates written back to Jira on manual changes.
- Works behind a corporate proxy (see below).

### Interface
- Dark theme, hand-made shadcn-style components, self-hosted Inter font.

## Security

- **Object-level access control**: a user only sees and changes the data of their own workspace. "Does not exist" and "not yours" return the same 404, pages included.
- **Closed registration**: invitation required (except the very first account), generic error messages that do not reveal whether an email is registered.
- **Login protection**: 3 failures per email and 10 failures per IP address within 15 minutes block new attempts; same response time whether the email exists or not; passwords of at least 12 characters.
- **Sessions**: expire after 8 hours of inactivity and are renewed while the person is active. "All devices" (top bar) signs out every session of the account; removing a member also revokes their sessions.
- **Cost control**: AI analyses are limited per user, per workspace and for the whole instance (30 per day by default, see `APEX_AI_DAILY_LIMIT`).
- Rate-limit counters are stored in PostgreSQL: they survive restarts and are shared between server instances. Keys are stored as SHA-256 hashes (no email or IP address in clear).
- HTTP security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Strict validation of all incoming data; uploaded logos checked on their actual bytes (PNG, JPEG, WebP).
- Jira integration restricted to `https://*.atlassian.net`, no redirects followed.
- No external response body and no imported file content is ever written to the server logs.
- The application refuses to start if a secret is missing or too weak.

## Installation (development)

### Prerequisites

1. **Node.js 24** - https://nodejs.org
2. **Docker Desktop** (or Docker Engine) - https://www.docker.com, running before you start the database.

### Steps

1. Install the dependencies:
   ```bash
   npm install
   ```
2. Create your environment file and replace every example value (instructions are in the file):
   ```bash
   cp .env.example .env        # Windows PowerShell: copy .env.example .env
   ```
   The application refuses to start if `NEXTAUTH_SECRET` keeps its example value or is shorter than 32 characters.
3. Start PostgreSQL (published on `127.0.0.1:5432` only):
   ```bash
   docker compose up -d
   ```
4. Create the tables:
   ```bash
   npx prisma migrate deploy
   ```
5. Choose **one** of the two options:
   - **Demo data**: `npm run db:seed` creates a demo workspace with several roadmaps, items, risks and cross-team dependencies. Accounts: `admin@demo.local` and one PM per team (`pm-rocker@demo.local`, `pm-solid@demo.local`, `pm-falcon@demo.local`, `pm-dmi@demo.local`, `pm-b2c@demo.local`). The password is random unless you set `SEED_DEMO_PASSWORD` (12 characters minimum) in `.env`. Running the seed again erases and recreates the demo workspace; it is refused in production.
   - **Empty instance**: start the application, open `/register` and create the first account, then create your workspace and invite your team from the Members page.
6. Start the application:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

### Stop / restart

- Stop the app: `Ctrl+C`
- Stop the database: `docker compose down` (data stays in `postgres-data/`)
- Restart: `docker compose up -d`, then `npm run dev`

### Corporate network with a proxy

If outgoing traffic must go through a proxy:

1. Set `JIRA_HTTP_PROXY` in `.env` (despite its name, it is used for both Jira and Anthropic). Leave it commented out when you are not behind the proxy, otherwise these calls fail.
2. If the proxy inspects HTTPS traffic with its own certificate, let Node trust your system certificates instead of disabling verification. Set the variable **in the system environment, not in `.env`** (Node reads it before `.env` is loaded), then open a new terminal:
   ```powershell
   [Environment]::SetEnvironmentVariable("NODE_USE_SYSTEM_CA", "1", "User")   # Windows
   ```
   ```bash
   export NODE_USE_SYSTEM_CA=1                                                  # macOS / Linux
   ```
   If that is not enough, point `NODE_EXTRA_CA_CERTS` to the proxy root certificate file. Never use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | yes | Session signing secret, 32 random characters minimum. Changing it signs everyone out |
| `NEXTAUTH_URL` | yes | Public URL of the application |
| `JIRA_ENCRYPTION_KEY` | yes | Encryption key for Jira API tokens, 32 random characters minimum |
| `JIRA_ENCRYPTION_KEY_PREVIOUS` | no | Previous key, only during a key rotation |
| `ANTHROPIC_API_KEY` | for AI imports | Anthropic API key |
| `APEX_AI_DAILY_LIMIT` | no | AI analyses per day for the whole instance (default 30) |
| `JIRA_HTTP_PROXY` | no | Outgoing HTTP proxy for Jira and Anthropic |
| `SEED_DEMO_PASSWORD` | no | Fixed password for the demo accounts |

## Before going to production

- Put Apex behind an **HTTPS reverse proxy** that sets `X-Forwarded-For` with the real client address, and never expose the Node port directly: IP-based limits rely on this header.
- Use strong, unique secrets, and set `NEXTAUTH_URL` to the public URL.
- Apply migrations with `npx prisma migrate deploy`, never with `migrate dev`.
- **Create the first account right after deployment**: until an account exists, anyone who reaches the instance can register as its first user.
- Set up automatic PostgreSQL backups.
- Check before each release:
  ```bash
  npx tsc --noEmit
  npm run build
  npm audit
  ```

## Roadmap

- Single sign-on (OpenID Connect).
- Multi-workspace accounts with a workspace switcher.
- Transactional emails: email verification, password reset, invitations bound to an email address.
- Content Security Policy with nonces.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · PostgreSQL · Prisma · NextAuth · Tailwind CSS · shadcn-style components · Anthropic Claude Haiku · Jira Cloud API · SheetJS · Docker Compose

## Useful tools

```bash
npx prisma studio
```
