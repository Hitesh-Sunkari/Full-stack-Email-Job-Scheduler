# ReachInbox — Distributed Email Scheduler

> **ReachInbox Outbox Labs Hiring Assignment** — Full-stack email scheduling application with BullMQ, PostgreSQL, Redis, and Elasticsearch.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Quick Start (Docker)](#quick-start-docker)
4. [Manual Development Setup](#manual-development-setup)
5. [Environment Variables](#environment-variables)
6. [API Reference](#api-reference)
7. [Scheduling Rules](#scheduling-rules)
8. [Rate Limiting](#rate-limiting)
9. [Slack Integration](#slack-integration)
10. [Elasticsearch Search](#elasticsearch-search)
11. [Bull Board Queue Monitor](#bull-board-queue-monitor)
12. [Running Tests](#running-tests)
13. [Project Structure](#project-structure)
14. [Submission Checklist](#submission-checklist)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND  (Vite + React 18)               │
│  Login → Google OAuth → Dashboard → Compose → Scheduled/Sent │
│  URL: http://localhost:5173                                   │
└────────────────────────┬────────────────────────────────────┘
                         │  REST + Session Cookie
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              EXPRESS API SERVER (Port 4000)                  │
│  /api/auth • /api/emails • /api/campaigns                    │
│  /api/senders • /api/search • /api/integrations/slack        │
│  /api/health • /admin/queues (Bull Board)                    │
└────┬──────────────────┬───────────────────┬────────────────-┘
     │                  │                   │
     ▼                  ▼                   ▼
┌─────────┐    ┌──────────────┐   ┌──────────────────┐
│PostgreSQL│    │   Redis 7    │   │ Elasticsearch 8  │
│(Prisma) │    │(BullMQ Jobs) │   │  (Full-text idx) │
└─────────┘    └──────┬───────┘   └──────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              EMAIL WORKER  (BullMQ Processor)                │
│  Consumes delayed jobs • Atomic Redis Lua rate-limiter       │
│  Ethereal SMTP dispatch • Elasticsearch index update          │
│  Slack notifications on rate-limit events                    │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Concern | Solution |
|---------|----------|
| Persistence | PostgreSQL via Prisma ORM — canonical source of truth |
| Scheduling | BullMQ `delay` option on Redis-backed delayed jobs |
| Restart safety | Recovery service re-enqueues SCHEDULED emails on startup |
| Idempotency | Unique `idempotencyKey` per email; `IF NOT EXISTS` inserts |
| Rate limiting | Redis Lua script — atomic per-sender hourly token bucket |
| Min delay | Second Lua script enforces ≥ 1 min gap between dispatches |
| Concurrency | Configurable BullMQ worker concurrency (`EMAIL_WORKER_CONCURRENCY`) |
| SMTP | Ethereal (test) accounts auto-created via `POST /api/senders/ethereal` |
| Secrets | AES-256-GCM encryption at rest for SMTP passwords |
| Auth | Google OAuth 2.0 → HTTP-only session cookie |
| Notifications | Slack Incoming Webhook / OAuth app with deduplication |
| Search | Elasticsearch with PostgreSQL fallback |

---

## Tech Stack

### Backend (`apps/api`)
- **Runtime**: Node.js 20 + TypeScript 5
- **Framework**: Express 4 + helmet + cors + express-session
- **ORM**: Prisma 5 (PostgreSQL 16)
- **Queue**: BullMQ 5 + ioredis 5
- **SMTP**: Nodemailer + Ethereal (nodemailer.createTestAccount)
- **Search**: `@elastic/elasticsearch` 8
- **Slack**: Slack Bolt SDK / Incoming Webhooks
- **Auth**: Google OAuth 2.0 (`googleapis` package)
- **Logging**: Pino (structured JSON)
- **Testing**: Vitest + @vitest/coverage-v8

### Frontend (`apps/web`)
- **Framework**: Vite 5 + React 18 + TypeScript 5
- **Styling**: Tailwind CSS 3 + lucide-react icons
- **State**: TanStack Query v5 (React Query)
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router v6

### Infrastructure (`infra/`)
- Docker Compose: PostgreSQL 16, Redis 7, Elasticsearch 8

---

## Quick Start (Docker)

> **Prerequisite**: Docker Desktop must be running.

```bash
# 1. Clone the repository
git clone <repo-url> && cd reachinbox_Assignment

# 2. Copy environment file and fill in secrets
cp .env.example apps/api/.env
# Edit apps/api/.env with your Google OAuth credentials

# 3. Start infrastructure
docker compose -f infra/docker-compose.yml up -d

# 4. Install Node dependencies
npm install

# 5. Run database migrations
npm run db:migrate --workspace=apps/api

# 6. Start API server + email worker
npm run dev --workspace=apps/api

# 7. (New terminal) Start React frontend
npm run dev --workspace=apps/web
```

Open **http://localhost:5173** in your browser.  
Bull Board queue monitor: **http://localhost:4000/admin/queues**  
Health check: **http://localhost:4000/api/health**

---

## Manual Development Setup

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 16 (or Docker)
- Redis 7 (or Docker)
- Elasticsearch 8 *(optional — app gracefully falls back to PostgreSQL)*

### Step-by-step

```bash
# Install all workspace dependencies
npm install

# Set up API environment
cp .env.example apps/api/.env
# Edit apps/api/.env

# Run Prisma migrations (creates all tables)
cd apps/api
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate

# Start API (Port 4000)
npm run dev

# In a separate terminal, start the frontend (Port 5173)
cd apps/web
npm run dev
```

---

## Environment Variables

Create `apps/api/.env` from `.env.example`:

```env
# Node
NODE_ENV=development
PORT=4000

# Database (PostgreSQL)
DATABASE_URL=postgresql://reachinbox:reachinbox@localhost:5432/reachinbox

# Redis
REDIS_URL=redis://localhost:6379

# Session
SESSION_SECRET=change-me-in-production

# AES Encryption Key for SMTP passwords (32-byte hex)
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback

# Frontend URL (for CORS & redirects)
FRONTEND_URL=http://localhost:5173

# Elasticsearch (optional)
ELASTICSEARCH_URL=http://localhost:9200

# Slack (optional)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/integrations/slack/callback

# Rate limits
EMAIL_MAX_PER_HOUR=45
EMAIL_MIN_DELAY_MINUTES=1

# Worker
EMAIL_WORKER_CONCURRENCY=5

# Bull Board admin credentials (for /admin/queues)
BULL_BOARD_USER=admin
BULL_BOARD_PASS=admin123
```

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/google` | Initiates Google OAuth flow |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/auth/me` | Get authenticated user profile |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/status` | Returns `isAuthenticated` + `isGoogleConfigured` |

### Sender Accounts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/senders` | List all sender accounts |
| POST | `/api/senders` | Create SMTP sender |
| POST | `/api/senders/ethereal` | Auto-create Ethereal test sender |
| DELETE | `/api/senders/:id` | Delete sender |

### Email Scheduling
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/emails/schedule` | Schedule a campaign with leads |
| GET | `/api/emails/scheduled` | Get scheduled/pending emails |
| GET | `/api/emails/sent` | Get sent/failed email history |
| GET | `/api/emails/stats/summary` | Get dashboard statistics |
| POST | `/api/emails/:id/cancel` | Cancel a pending email |

### Campaigns
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/campaigns` | List all campaigns |
| GET | `/api/campaigns/:id` | Get campaign with emails |

### Search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search/emails?q=&status=&senderId=` | Full-text search via Elasticsearch |

### Slack Integration
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integrations/slack` | Get Slack connection status |
| GET | `/api/integrations/slack/connect` | Start Slack OAuth |
| GET | `/api/integrations/slack/callback` | Slack OAuth callback |
| POST | `/api/integrations/slack/disconnect` | Disconnect Slack |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | System health check |
| GET | `/api/health/ready` | Readiness probe |

---

## Scheduling Rules

The `POST /api/emails/schedule` endpoint accepts:
```json
{
  "senderAccountId": "uuid",
  "subject": "Hello {{firstName}}",
  "body": "Hi {{firstName}}, welcome to {{company}}!",
  "leads": [
    { "email": "alice@example.com", "firstName": "Alice", "company": "Acme" }
  ],
  "scheduledAt": "2024-12-01T09:00:00Z",  // optional — defaults to now
  "campaignName": "Q4 Outreach"
}
```

- **Variable interpolation**: `{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{company}}` in subject and body.
- **BullMQ delay**: Each email gets a `delay = scheduledAt - now` (ms) applied as a BullMQ job option.
- **Idempotency**: If the same email+sender+scheduledTime combo is submitted again, the existing job is returned.

---

## Rate Limiting

Distributed rate limiting uses **atomic Redis Lua scripts**:

1. **Hourly cap** (`rate-limiter.ts`):
   - Default: 45 emails/sender/hour (configurable via `EMAIL_MAX_PER_HOUR`)
   - Implemented as a sliding window token bucket in Redis
   - Returns `{ allowed: boolean, retryAfterMs: number, remainingInWindow: number }`

2. **Minimum gap** (`rate-limiter.ts`):
   - Default: 60 seconds between dispatches for the same sender
   - Uses Redis key expiry to enforce minimum delay
   - Worker backs off and re-queues if delay is needed

Both operations are atomic — safe for parallel distributed workers.

---

## Slack Integration

1. Connect Slack via `/api/integrations/slack/connect` (OAuth) or provide a `SLACK_WEBHOOK_URL` in `.env`.
2. The worker sends a Slack notification when a sender reaches >80% of their hourly quota.
3. Deduplication: The same rate-limit event for the same sender is only notified once per hour.
4. Stored in `SlackConnection` and `NotificationEvent` tables.

---

## Elasticsearch Search

- On startup, the API creates/verifies the `emails` index with mappings for `subject`, `recipient`, `body`, `status`, `senderEmail`, and `sentAt`.
- Every sent/failed email is indexed after dispatch.
- `GET /api/search/emails?q=keyword` performs multi-field search with highlighting.
- **Fallback**: If Elasticsearch is unreachable, the search falls back to a PostgreSQL `ILIKE` query automatically.

---

## Bull Board Queue Monitor

Visit **http://localhost:4000/admin/queues** to inspect the BullMQ queue in real-time.

- Username: `admin` (or `BULL_BOARD_USER`)
- Password: `admin123` (or `BULL_BOARD_PASS`)

Shows active, delayed, completed, failed, and waiting jobs.

---

## Running Tests

```bash
# From the repo root
npm run test --workspace=apps/api

# With coverage report
cd apps/api && npx vitest run --coverage
```

### Test Coverage

| Test File | What it Tests |
|-----------|---------------|
| `crypto.test.ts` | AES-256-GCM encrypt/decrypt round-trip, idempotency |
| `scheduler-validation.test.ts` | Zod schema validation for schedule payloads |
| `csv-parser.test.ts` | CSV lead parsing, error handling, variable extraction |
| `rate-limiting.test.ts` | Redis Lua script logic for hourly caps and min delay |
| `slack.test.ts` | Slack deduplication — same event not double-notified |
| `recovery.test.ts` | Database-backed queue reconciliation and PROCESSING reset |

**Result: 22/22 tests pass ✅**

---

## Project Structure

```
reachinbox_Assignment/
├── apps/
│   ├── api/                         # Express API + BullMQ worker
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # Database schema
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── app.ts               # Express app factory
│   │   │   ├── server.ts            # HTTP server entry + startup
│   │   │   ├── config/              # env, database, redis, elasticsearch, logger
│   │   │   ├── lib/                 # crypto.ts (AES-256-GCM)
│   │   │   ├── middleware/          # auth, error handler
│   │   │   ├── modules/
│   │   │   │   ├── auth/            # Google OAuth service + controller
│   │   │   │   ├── campaigns/       # Campaign CRUD
│   │   │   │   ├── emails/          # Schedule, list, cancel, stats
│   │   │   │   ├── health/          # Health check endpoints
│   │   │   │   ├── queue/           # Bull Board setup
│   │   │   │   ├── scheduling/      # queue.ts, rate-limiter.ts, scheduler-service.ts, recovery-service.ts
│   │   │   │   ├── search/          # Elasticsearch search service + controller
│   │   │   │   ├── senders/         # SMTP account management
│   │   │   │   └── slack/           # Slack OAuth + notifications
│   │   │   ├── workers/
│   │   │   │   └── email-worker.ts  # BullMQ email processor
│   │   │   └── cli/                 # recover.ts, reindex.ts CLI scripts
│   │   └── tests/                   # 22 unit tests
│   │
│   └── web/                         # Vite + React 18 frontend
│       ├── src/
│       │   ├── App.tsx              # Routes: / → /auth/callback → /dashboard
│       │   ├── main.tsx             # React entry point
│       │   ├── components/          # Navbar, MetricCard, StatusBadge, ProtectedRoute, OAuthCallback
│       │   ├── features/
│       │   │   ├── compose/         # ComposeModal (recipients CSV upload + template)
│       │   │   ├── scheduled-emails/# ScheduledEmailsTable
│       │   │   ├── sent-emails/     # SentEmailsTable
│       │   │   └── slack/           # SlackBanner
│       │   ├── lib/                 # api-client.ts, csv-parser.ts
│       │   ├── pages/               # LoginPage, DashboardPage
│       │   ├── styles/              # index.css (Tailwind + custom utilities)
│       │   └── types/               # api.ts (re-exports from @reachinbox/shared)
│       └── vite.config.ts           # Proxy /api → :4000
│
├── packages/
│   └── shared/                      # @reachinbox/shared
│       └── src/
│           ├── constants.ts         # EMAIL_STATUS, CAMPAIGN_STATUS, limits
│           ├── types.ts             # Shared TypeScript interfaces
│           ├── schemas.ts           # Zod validation schemas
│           └── index.ts             # Re-exports
│
└── infra/
    └── docker-compose.yml           # PostgreSQL 16, Redis 7, Elasticsearch 8
```

---

## Submission Checklist

### Core Features
- [x] **Google OAuth 2.0** login with session persistence
- [x] **Multiple sender accounts** with SMTP credential management
- [x] **Ethereal test SMTP** auto-provisioning via `POST /api/senders/ethereal`
- [x] **AES-256-GCM encryption** of SMTP passwords at rest
- [x] **Campaign scheduling** with BullMQ delayed jobs
- [x] **CSV/text lead upload** with variable interpolation
- [x] **React dashboard** with Scheduled / Sent history tabs
- [x] **Stats cards** (Total, Pending, Delivered, Failed)
- [x] **Search bar** (Elasticsearch full-text with PostgreSQL fallback)
- [x] **Cancel pending email** action
- [x] **Compose Modal** with sender picker, CSV upload, and template editor

### Scheduling & Reliability
- [x] **BullMQ delayed jobs** with configurable delay from `scheduledAt`
- [x] **Restart-safe recovery** — re-enqueues pending emails on server startup
- [x] **Idempotency keys** — prevents duplicate scheduling
- [x] **Processing state reset** — PROCESSING emails reverted to SCHEDULED on crash recovery
- [x] **Stale job reconciliation** — delayed but never-processed jobs re-queued

### Rate Limiting
- [x] **Per-sender hourly cap** (default: 45 emails/hour)
- [x] **Minimum inter-send delay** (default: 60 seconds)
- [x] **Distributed atomic Lua scripts** for multi-worker safety
- [x] **Retry-after semantics** — worker backs off and re-schedules throttled emails

### Integrations
- [x] **Slack OAuth** integration with notification on quota events
- [x] **Slack deduplication** — same rate-limit event only fires once per hour
- [x] **Elasticsearch indexing** of sent/failed emails
- [x] **PostgreSQL fallback** when Elasticsearch is unreachable
- [x] **Bull Board** `/admin/queues` with Basic Auth

### Developer Experience
- [x] **Docker Compose** for PostgreSQL, Redis, Elasticsearch
- [x] **Vitest** unit tests — 24/24 passing (including Search & Recovery tests)
- [x] **TypeScript** throughout (zero `tsc` errors)
- [x] **Environment template** (`.env.example`)
- [x] **Structured logging** with Pino
- [x] **Request ID tracing** via `X-Request-Id` header
- [x] **API health check** endpoint
- [x] **CLI scripts** for manual recovery and Elasticsearch reindex

---

## Distributed Delivery Semantics & The Crash Window

In distributed email architectures, **strictly exactly-once delivery over SMTP is mathematically impossible** due to the fundamental Two Generals' Problem:
1. When the email worker dispatches an email via SMTP (`SmtpService.sendMail`), the remote SMTP server accepts the message (HTTP 200 / SMTP 250 OK).
2. If the worker node encounters an ungraceful hardware fault, SIGKILL, or network partition in the microsecond window *after* SMTP acceptance but *before* PostgreSQL commits `status = SENT`, the database record remains in `PROCESSING`.
3. Upon startup, the `RecoveryService` safely reclaims stale `PROCESSING` jobs. To prevent message loss, this adheres to **at-least-once delivery with aggressive crash-window minimization**:
   - The execution gap between SMTP socket resolution and the atomic database update is reduced to a single asynchronous operation (<10ms).
   - Idempotency keys generated via SHA-256 (`campaign:{id}:recipient:{email}:idx:{n}`) guarantee idempotency at the database and queue ingestion boundary.
   - Redis distributed leases coordinate worker concurrency and prevent duplicate parallel processing.
   - Ethereal SMTP delivery provides unique `smtpMessageId` and `etherealPreviewUrl` persisted directly to PostgreSQL for end-to-end auditability.

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project → Enable "Google+ API" and "People API"
3. Navigate to **APIs & Services → Credentials**
4. Create **OAuth 2.0 Client ID** (Web application type)
5. Authorized redirect URIs: `http://localhost:4000/api/auth/google/callback`
6. Copy the Client ID and Secret into `apps/api/.env`

---

## Demo Workflow

1. Start all services (`docker compose up -d` + `npm run dev` for both apps)
2. Open http://localhost:5173 → Sign in with Google
3. Click **Compose Campaign** → upload a CSV of leads:
   ```csv
   email,firstName,lastName,company
   alice@example.com,Alice,Smith,Acme
   bob@example.com,Bob,Jones,Beta Corp
   ```
4. Pick a sender (or create an Ethereal test sender)
5. Set subject: `Hello {{firstName}}!` and body with any `{{company}}` variable
6. Choose a scheduled time (≥ 1 minute in the future) and click **Schedule**
7. Watch emails appear in the **Scheduled** tab
8. Monitor queue at http://localhost:4000/admin/queues (admin / admin123)
9. After scheduled time, emails move to **Sent & History** tab with preview URLs

---

*Built for the ReachInbox Outbox Labs Hiring Assignment.*  
*Node.js · TypeScript · Express · BullMQ · PostgreSQL · Redis · Elasticsearch · React · Vite*
