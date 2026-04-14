# IntentOS

IntentOS is now organized around the OpenClaw-style workspace layout:

```text
apps/
  backend/   Fastify backend built on the OpenClaw gateway adapter stack
  frontend/  React + Vite frontend, using the original workspace visual style
  desktop/   Electron shell, alongside backend/frontend
packages/
  shared/                    Shared intent domain types and API schema
  openclaw-gateway-client/   Gateway client package
```

Legacy `server/web/protocol/sdk/ui` content has been moved out of the main workspace into `.legacy/` so the active app structure matches the new architecture.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Add your OpenClaw auth to `.env`:

```env
OPENCLAW_GATEWAY_URL=ws://localhost:18789
OPENCLAW_TOKEN=...
```

## Run

Start the backend:

```bash
pnpm dev:backend
```

Start the frontend:

```bash
pnpm dev:frontend
```

Start the desktop app:

```bash
pnpm dev:desktop
```

## Checks

```bash
pnpm check
pnpm test
```

## Notes

- Backend defaults to `http://localhost:3030`
- Frontend dev server defaults to `http://localhost:5173`
- Web frontend calls relative `/api/...` paths by default; in dev, Vite proxies `/api` to `http://localhost:3030`
- `VITE_BOOT_ALWAYS_SHOW=1` keeps the boot sequence visible on every launch
- Boot simulation is hardcoded in `apps/backend/src/domain/boot-setup.ts`
- `/api/health` only reports backend health; boot state is exposed separately via `/api/boot/status` and `/api/boot/events`
