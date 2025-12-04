# Server Relay

A lightweight relay that replaces the previous peer-to-peer experiment with a conventional host ⇄ client model. The server is **never bundled with the frontend** – deploy it once (Render/Fly/Dokku/etc.) or run it locally for debugging, then point the web app at the hosted URL via `VITE_SERVER_URL` (falls back to `VITE_MISSION_SERVER_URL` for backward compatibility).

## Highlights
- **WebSocket-based transport** keeps connections open with minimal framing overhead.
- **Session codes** (6-character alphanumeric) give HQ an easy code to pass to field devices.
- **Host-authoritative state** – only the host publishes the canonical route snapshot, which is cached server-side for its own auditing.
- **One-way uplink** – clients never receive other participants’ data; they simply transmit their own GPS/route information to HQ.
- **Delta-friendly caching** – route blobs are compressed once, hashed, and only re-cached if the payload changed.
- **Low-data tuning** – location updates are server-throttled per session (default 10 s, clamped between 5 s and 120 s) and stale participants are culled via heartbeats.
- **Dropout recovery** – each socket tracks its last session + role so the client can auto-retry without asking the user for the code again.

## Message Flow

| Direction | Type | Purpose |
|-----------|------|---------|
| Host → Server | `host:init` | Request a new session code. Server replies with `session:ready`.
| Client → Server | `client:join` | Join an existing code. Server replies with `session:ready` + latest snapshot.
| Client → Server | `participant:location` | Push `{lat,lng,accuracy?,timestamp}`. Server throttles and forwards **only to the host** as `session:location`.
| Client → Server | `client:routes` | Upload the sender’s current plan (`{id,name?,color?,items[]}`); server sanitises, deduplicates, and forwards to HQ as `session:peer-routes`.
| Host → Server | `host:state` | Publish the latest mission/routes snapshot. Payload is `lz-string` compressed JSON. Server caches and echoes to the host (`session:state`).
| Host → Server | `host:interval` | Request a new location cadence (ms). Server clamps, persists, and notifies everyone via `session:interval`.
| Any → Server | `participant:message` | Lightweight status/chat message (displayed in Connection Manager logs).
| Server → Host | `session:peer-joined` / `session:peer-left` | Notify HQ that team composition changed.
| Server → Host | `session:peer-routes` | Sends the latest sender route snapshot (if any) for display inside HQ’s map.
| Server → Host/Clients | `session:interval` | Broadcast the enforced location cadence (ms).
| Server → Any | `session:error` | Human-readable error (e.g., bad code, host already exists).

## Running It

```bash
cd server
npm install
npm start        # starts on ws://localhost:4000 by default
```

Environment knobs (set via `.env` or shell vars):

- `SERVER_PORT` (or legacy `MISSION_SERVER_PORT`) – TCP port (default `4000`).
- `SESSION_CODE_LENGTH` – length of generated codes (default `6`).
- `LOCATION_INTERVAL_MS` – default ms between accepted location packets per participant (default `10000`, always clamped between 5000–120000 ms).
- `ROUTE_UPDATE_INTERVAL_MS` – minimum ms between accepted route uploads per client (default `8000`).
- `MAX_CLIENT_ROUTES` – max number of routes retained per client snapshot (default `8`).
- `MAX_ROUTE_POINTS` – max checkpoints stored per route snapshot (default `80`).
- `SESSION_TTL_MS` – auto-expiry for dormant sessions (default `6 hours`).

## Client Expectations

The frontend consumes the following structure:

```ts
peer := {
  id: string;
  color: string;      // stable per participant
  label: string;      // short code for UI badges
  location?: { lat: number; lng: number; accuracy?: number; timestamp?: number; };
  routes?: Array<{ id: string; items: Array<{ id: string; name?: string; position: { lat: number; lng: number; } }> }>;
}
```

Field devices populate `routes` whenever they push a plan snapshot upstream; HQ-only clients receive those via `session:peer-routes` so the map can render each sender’s plan with their assigned badge colour.

## Typical Deployment

1. Deploy `server/` to your preferred platform (Docker, Fly.io, Railway, Render, bare metal, etc.).
2. Expose the WebSocket port publicly (or behind VPN) so normal users never need to run a local server.
3. In the frontend, set `VITE_SERVER_URL` to the deployed `wss://` endpoint before building/serving. Non-developers simply open the web app; only folks wanting deeper control need to run this server themselves.

## File Layout

```
server/
├── README.md (this file)
├── package.json / package-lock.json
└── src/
    └── index.js          # express + ws entry point
```

The single entry point keeps the deployment story simple and is easy to run behind SSH tunnels or dokku-style sandboxes.```}