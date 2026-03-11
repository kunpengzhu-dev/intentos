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

### Recommended: Desktop app

Use the Desktop flow below for the default local setup.

### Desktop (Electron)

```bash
# Install dependencies
pnpm install

# Create root env file
cp .env.example .env

# (PowerShell)
# Copy-Item .env.example .env
```

You can get `OPENCLAW_GATEWAY_TOKEN` for your root `.env` from:

```bash
openclaw dashboard --no-open
```

From output like `Dashboard URL: http://127.0.0.1:18789/#token=...`, copy the value after `token=` into `.env`:

Then start desktop app (will run server + web + electron together):

```bash
pnpm dev:desktop
```

### OpenClaw first-time pairing

After the first `pnpm dev:desktop`, approve the new desktop device in OpenClaw:

```bash
openclaw devices list
openclaw devices approve <pending-request-id>
```

Use `openclaw devices list` to find the pending device request id (a UUID shown in the `Pending pair` device row), then run `openclaw devices approve <pending-request-id>`.

### Optional: Run server + web separately

```bash
# Install dependencies
pnpm install

# Create root env file
cp .env.example .env

# Start the server (port 3001)
cd apps/server && pnpm dev

# In another terminal, start the web app (port 5173)
cd apps/web && pnpm dev
```

Open http://localhost:5173 to see IntentOS.

### Desktop production run and Harmony packaging

```bash
# Production-like desktop run (builds web + server, then starts Electron with embedded server)
pnpm desktop

# Prepare HarmonyOS resources (output defaults to apps/desktop/dist/harmony/app)
pnpm prepare:harmony
```

If you want to point Electron at a different backend:

```bash
INTENTOS_SERVER_URL=http://localhost:3001 pnpm dev:desktop
```

If you want the Boot screen to appear on every launch (ignore localStorage gate):

```bash
VITE_BOOT_ALWAYS_SHOW=1 pnpm dev:desktop
VITE_BOOT_ALWAYS_SHOW=1 pnpm prepare:harmony
```

For persistent local usage, put `VITE_BOOT_ALWAYS_SHOW=1` in the repo root `.env`.

### What you'll see

1. **Boot screen** — System checks (server, agent, storage) with animated status
2. **Home dashboard** — Suggested tasks (top) and active/completed intent cards
3. **AI Orb** — Draggable floating assistant, click to chat
4. **Execution page** — Click any intent card to see step timeline and artifacts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Zustand, Framer Motion |
| Backend | Fastify, WebSocket (ws), in-memory event store |
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
