# IntentOS

An intent-driven AI operating system that bridges human intent and AI execution. Users issue tasks, and IntentOS automatically generates **intent cards** that are completed across multiple applications by a general-purpose agent.

> **Under Development** — This project is in early development. APIs and architecture may change.

## Architecture

IntentOS is a monorepo with 7 packages:

```
packages/
  protocol/     — Shared types, Envelope, EVENT_META, DTOs (pure types + constants)
  core/         — Domain logic: state machines, transitions, projections (no IO)
  sdk/          — Browser WebSocket client with reconnect, seq tracking, cursor
  ui/           — Design system tokens + React hooks
  adapters/
    openclaw/   — OpenClaw agent adapter with policy gate
apps/
  web/          — React + Vite frontend (Boot, Home, Execution pages, AI Orb)
  server/       — Fastify BFF + WebSocket + SQLite event store
  desktop/      — Electron shell that hosts the web app
```

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the server (port 3001)
cd apps/server && pnpm dev

# In another terminal, start the web app (port 5173)
cd apps/web && pnpm dev
```

Open http://localhost:5173 to see IntentOS.

### Desktop (Electron)

```bash
# Install dependencies
pnpm install

# Development mode (server + web + electron)
pnpm dev:desktop

# Production-like desktop run (web + server are built, server is embedded by Electron main process)
pnpm desktop
```

If you want to point Electron at a different backend:

```bash
INTENTOS_SERVER_URL=http://localhost:3001 pnpm dev:desktop
```

Prepare HarmonyOS resources (output defaults to `apps/desktop/dist/harmony/app`):

```bash
pnpm --filter @intentos/desktop prepare:harmony
```

### What you'll see

1. **Boot screen** — System checks (server, agent, storage) with animated status
2. **Home dashboard** — Suggested tasks (top) and active/completed intent cards
3. **AI Orb** — Draggable floating assistant, click to chat
4. **Execution page** — Click any intent card to see step timeline and artifacts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Zustand, Framer Motion |
| Backend | Fastify, WebSocket (ws), SQLite (better-sqlite3), Drizzle ORM |
| Protocol | Event-sourced, dual-layer streams (global + run), cursor-based replay |
| Build | pnpm workspaces, Turborepo, TypeScript 5.8 |

## Protocol Design

IntentOS uses an event-driven WebSocket protocol:

- **CMD** — Client commands (intent/create, chat/send, etc.)
- **ACK** — Server acknowledgments with accepted/rejected status
- **EVT** — Replayable facts stored in event store (intent/created, run/step_upserted, etc.)
- **NOTIFY** — Ephemeral UI enhancements (run/progress, global/snapshot)

See [docs/architecture-plan.md](docs/architecture-plan.md) for the full protocol specification.

## Development

```bash
# Run all builds
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Clean all build artifacts
pnpm clean
```

## License

[MIT](LICENSE)
