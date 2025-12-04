# CadNav

Mobile-oriented navigation planner that combines marker management, compass guidance, and routing powered by OpenStreetMap data.

## Relay Behaviour
- Field devices act as **senders only**. They publish GPS fixes (and future route payloads) upstream, while HQ receives the aggregate view.
- The host can now set the **update cadence** anywhere between 5–120 seconds from the Connection Manager slider. The choice is enforced server-side and pushed to every connected client via `session:interval`.
- Join handshakes only deliver the participant’s own metadata, so field devices never see peer locations or host plans.
- Route snapshots travel on a dedicated channel: senders upload sanitised routes at most every ~8 seconds, and HQ receives them via `session:peer-routes` without echoing them back to the field.

## Data Optimisation Roadmap
1. **Compressed sender payloads** – reuse the existing Share/Export binary format so client uploads shrink before they leave the device.
2. **Host-side colour assignment** – strip colour info from client packets and rely on HQ to paint lines using the participant’s badge colour, shaving a few bytes per vertex.
3. **Adaptive throttles** – dynamically raise/lower the route interval based on snapshot size so sparse patrols can update faster than dense routes without blowing bandwidth.
4. **Delta routing** – extend the relay to accept patch-style updates (added/removed checkpoints) to avoid resending the entire array for small edits.

## HTTPS Ping Errors During Local Dev
Modern browsers refuse to mix secure and insecure transports. If you load CadNav over `https://` (for example when testing camera/QR code access) but the relay still points to `ws://localhost:4000`, Chrome will drop the socket as “mixed content” once the server sends its first ping. This surfaces as repeated `WebSocket ping error` entries in the console.

**Fixes:**
1. Serve the UI over plain `http://` whenever you target a non-TLS relay (`ws://`). This is Vite’s default dev mode and sidesteps the mixed-content check.
2. Or terminate TLS for the relay (mkcert + reverse proxy, Caddy, nginx, ngrok, etc.) and update `VITE_SERVER_URL` to the resulting `wss://` endpoint so the schemes match.

Either route keeps navigator APIs happy (camera, geolocation, compass) while preventing the ping/pong disconnect loop.