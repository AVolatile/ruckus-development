# Historical split deployment guide — Phase 0

**Superseded for authenticated Phase 1 hosting.** This guide describes the original static demo topology. Do not follow its upstream-repository or deploy commands for the startup application. Use [DEPLOYMENT.md](DEPLOYMENT.md): one application origin for pages, authentication, API and Socket.IO. Unrelated netlify.app/onrender.com cookies are not a supported authentication architecture. No deployment has been performed during Phase 1.

# Netlify frontend + Render realtime production guide

**READY FOR DEPLOYMENT — EXTERNAL SETUP REQUIRED.** The repo contains both deploy targets. Netlify access was available, but no Render account/API authorization was available. A public two-service deployment and physical office/cellular joining have not been verified. All hostnames below are examples until you replace them with provider-issued URLs.

## Architecture

```text
Conference-room browser / phone
          | HTTPS: frontend, routes, fonts, SVG, JS
          v
       Netlify CDN
          | client connects over HTTPS polling / WSS
          v
Persistent Render Node service
Express + Socket.IO + authoritative in-memory rooms
```

Netlify serves the React frontend, not the persistent game process. Use one always-on Render instance. The Blueprint selects the paid `starter` plan to avoid free-instance idle sleep; review current pricing in your account before provisioning. A restart/deploy still clears rooms.

[Render's Node deployment guide](https://render.com/docs/deploy-node-express-app), [Socket.IO origin/CORS documentation](https://socket.io/docs/v4/handling-cors/) and [Netlify SPA rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/) describe the provider behavior this configuration uses.

## Exact setup order

1. Commit and push the completed repository to `AVolatile/icebreaker-game-project` (commands below).
2. In Netlify, create/import a project from that repository. Read `netlify.toml`: build `npm run build:client`, publish `dist`, Node 22. Reserve the desired project name and record its **HTTPS frontend origin**. Do not use a guessed hostname.
3. In Render, sign in/connect GitHub and create a Blueprint from this repository's `render.yaml`, or create a Node Web Service manually. Choose one always-on instance. Set `CLIENT_ORIGIN` and `PUBLIC_APP_URL` to the exact Netlify origin. Build `npm ci && npm run build:server`; start `npm run start:server`; health `/health`. Render supplies `PORT`.
4. Wait for Render to become healthy. Record its real **HTTPS service origin**. Set Netlify build variables `VITE_REALTIME_URL` to that origin and `VITE_PUBLIC_APP_URL` to the frontend origin. Trigger a frontend build/deploy. `build:client` refuses a Netlify build missing these values or using an insecure URL.
5. Open the Netlify app, create a room, and inspect its QR link. It must be `https://YOUR-FRONTEND/join?room=ABCDE`. Join from a second browser and a physical phone on cellular. Start an Original and a Studio board; answer, reveal, refresh both host and phone, finish and rematch.
6. Verify deep links `/studio`, `/studio/boards/new`, `/games/hotwire` and `/join?room=ABCDE` by navigating directly and refreshing. Confirm no browser console/network errors, no mixed content and no CORS rejection. Test polling fallback and WebSocket upgrade. Only then label the product deployed and verified.

The first Netlify build can fail until both public values exist; that is intentional. Reserve the site first, deploy the backend second, build the usable frontend third. Do not deploy a frontend configured to a placeholder backend as if live multiplayer works.

## Environment configuration

| Scope            | Variable              | Value                                                       |
| ---------------- | --------------------- | ----------------------------------------------------------- |
| Netlify build    | `VITE_REALTIME_URL`   | `https://YOUR-SERVICE.onrender.com`                         |
| Netlify build    | `VITE_PUBLIC_APP_URL` | `https://YOUR-SITE.netlify.app`                             |
| Render           | `NODE_ENV`            | `production`                                                |
| Render           | `REALTIME_ONLY`       | `true`                                                      |
| Render           | `CLIENT_ORIGIN`       | `https://YOUR-SITE.netlify.app`                             |
| Render           | `PUBLIC_APP_URL`      | `https://YOUR-SITE.netlify.app`                             |
| Render, optional | `ALLOWED_ORIGINS`     | Specific additional HTTPS frontend origins, comma-separated |
| Render supplied  | `PORT`                | Provider-selected listener port                             |

No trailing path, query, credentials or `/join` in origin values. No secret belongs in a `VITE_` variable. Rebuild after changing frontend variables. If you add a custom domain, change both frontend/public backend values, explicitly allow the old/new origins during migration, then remove old origins when no longer needed. Deploy previews require explicit allowlisting; do not wildcard all `netlify.app` domains.

`PUBLIC_JOIN_URL` remains a legacy local alias. Prefer `PUBLIC_APP_URL`. Public production rejects localhost, private LAN addresses and HTTP frontend links. An origin-less native client is accepted, but still needs valid room/session capabilities. Browser-origin checks are not authentication.

## Health, lifecycle and reconnect

`GET /health` and `/api/health` return JSON service status. Use `/health` in Render. Socket.IO runs on the same HTTP port; the provider terminates TLS. `CLIENT_ORIGIN`/allowlist govern CORS for polling and `allowRequest` for WebSocket origins. Client HTTPS refuses an HTTP realtime endpoint.

Host and player tokens are stored per tab in sessionStorage. Refresh/brief disconnection restores the room while the process is alive. Host absence ends a room after five minutes; idle rooms clear after two hours; ended rooms clear after a minute. Cleanup runs every 30 seconds. Deploys/restarts lose live rooms. Run one instance until shared authoritative state is implemented; a Redis adapter alone does not solve persistence.

## Local split verification

```sh
# Build with local split endpoints (development verification only)
VITE_REALTIME_URL=http://localhost:4314 VITE_PUBLIC_APP_URL=http://localhost:4313 npm run build:client
npm run build:server
# Terminal 1
PORT=4314 NODE_ENV=test REALTIME_ONLY=true CLIENT_ORIGIN=http://localhost:4313 PUBLIC_APP_URL=http://localhost:4313 npm run start:server
# Terminal 2
npx vite preview --host 0.0.0.0 --port 4313
# Terminal 3
node scripts/split-production-smoke.mjs
```

This proves two-origin configuration, actual joining, origin rejection and route/asset behavior locally. It does not prove public TLS, physical phones or office-network policies. Rebuild with real public HTTPS values before uploading `dist`.

## Exact deployment commands

```sh
npm ci
npm run dev
npm run build
npm run build:server
NODE_ENV=production REALTIME_ONLY=true CLIENT_ORIGIN=https://YOUR-SITE.netlify.app PUBLIC_APP_URL=https://YOUR-SITE.netlify.app PORT=10000 npm run start:server

# Build-equivalent Netlify check with real origins
VITE_REALTIME_URL=https://YOUR-SERVICE.onrender.com VITE_PUBLIC_APP_URL=https://YOUR-SITE.netlify.app netlify build --offline

# Review and publish source (run from repository root)
git status --short
git diff --check
git add .
git commit -m "Expand Ruckus with Studio and split production deployment"
git push origin main

# After reserving the project and starting the backend
netlify login
netlify link --id YOUR_NETLIFY_SITE_ID
netlify env:set VITE_REALTIME_URL https://YOUR-SERVICE.onrender.com
netlify env:set VITE_PUBLIC_APP_URL https://YOUR-SITE.netlify.app
VITE_REALTIME_URL=https://YOUR-SERVICE.onrender.com VITE_PUBLIC_APP_URL=https://YOUR-SITE.netlify.app netlify build
netlify deploy --prod --dir=dist
```

Render initial provisioning is done through its Blueprint/Web Service UI because no Render CLI/auth is installed here. After Git linking, pushing to the configured branch triggers the Render build/start commands above. Do not claim a Render CLI deploy command exists in this workspace. The same Git source can drive Netlify continuous deployment.

## Troubleshooting

| Symptom                                   | Check and fix                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| QR points to localhost/LAN                | Set Render `PUBLIC_APP_URL` to the Netlify HTTPS origin, restart service, create a new room. Existing room links are snapshots.                 |
| CORS blocked / WebSocket rejected         | Set exact `CLIENT_ORIGIN` including scheme; explicitly add the active preview/custom origin to `ALLOWED_ORIGINS`.                               |
| Mixed-content error                       | `VITE_REALTIME_URL` must use HTTPS when the frontend is HTTPS. Rebuild; inspect the client request origin.                                      |
| Socket disconnected / backend unavailable | Check Render `/health`, logs, service status, TLS and whether the instance is sleeping/restarting.                                              |
| Room not found                            | Check backend URL mismatch, server restart, cleanup expiration, or multiple independent backend instances. Create a new room if state was lost. |
| Refresh causes 404                        | Verify publish is `dist` and `netlify.toml` SPA rewrite is deployed. Static assets must resolve before fallback.                                |
| Wrong realtime URL after env change       | Frontend URLs are baked into the build. Trigger a fresh deployment rather than only restarting the backend.                                     |
| Phone cannot reach LAN room               | Check same Wi-Fi, client isolation, VPN, firewall, and explicit `PUBLIC_APP_URL` for the correct interface.                                     |
| Local Studio board missing                | Boards belong to that browser origin/profile. Export/import JSON to move between local, preview and production origins.                         |

## Public release acceptance

Do not accept only a successful build. Confirm the public host, QR link, a cellular phone and a Wi-Fi phone see the same room; submit correct/incorrect choices and a drawing; test refresh and pause; complete a custom board with a summary; verify all six Originals remain available. Record actual tested device/network combinations and provider URLs. No physical phone/cellular claims were made during this implementation.
