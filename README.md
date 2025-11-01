# Cadet Map

Mobile-oriented navigation planner that combines marker management, compass guidance, and routing powered by OpenStreetMap data.

## Project Layout

```
cadet-map/
├── frontend/   # Vite + React + Tailwind application
└── server/     # Express API for auth and routing proxies
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on http://localhost:5173. It proxies `/api` calls to the backend.

### Backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

The API listens on http://localhost:4000 by default and exposes:

- `POST /api/auth/login` – username/password auth backed by `users.json`
- `GET /api/health` – simple health check
- `POST /api/routes/osrm` – placeholder for upcoming routing integration

### Default Credentials

```
username: cadet
password: northstar123
```

## Next Steps

- Wire `POST /api/routes/osrm` to OSRM or OpenRouteService.
- Persist checkpoints and sessions (SQLite or file storage).
- Harden authentication (hash passwords, enforce HTTPS, add refresh tokens).
- Implement compass fallbacks for unsupported devices and manual calibration.
- Add PWA manifest, service worker, and offline caching.
