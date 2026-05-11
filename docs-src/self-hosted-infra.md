# Self-hosted infrastructure

TagBoard is a static site. Signaling and TURN relay are provided by three independently deployable open-source services on a single Hetzner VPS at `turn.0docker.com`.

```
┌───────────────────────────────┐
│ TagBoard (this app)           │
│ GitHub Pages, no backend      │
│ AprilTag detection in-browser │
└──────────┬─────────┬──────────┘
           │         │
   wss://  │         │ https://
  signaling│         │ TURN creds
           ▼         ▼
   ┌──────────┐  ┌──────────┐    turn:3479
   │signaling │  │turn-token│  ┌───────────┐
   │ -server  │  │ -server  │  │  coturn   │
   └──────────┘  └────┬─────┘  │ -hetzner  │
                      │HMAC    └───────────┘
                      └─shared secret──┘
```

## Services

| Repo                                                                                | Endpoint                               | What it does                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| [baditaflorin/signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol pub/sub fan-out. Treats `data` as opaque. |
| [baditaflorin/turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | HMAC-SHA1 TURN credentials with a 1-hour TTL.               |
| [baditaflorin/coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479` UDP/TCP   | The actual TURN relay. coturn 4.6 in Docker.                |

All three have `/health`, Prometheus `/metrics`, nginx configs, and bootstrap scripts. ~4 €/month total.

## How TagBoard uses the stack

TagBoard uses **y-webrtc** with our signaling URL and our TURN token URL:

```ts
// src/lib/yjsRoom.ts
const turnState = await fetchIceServers(); // GET /credentials
const provider = new WebrtcProvider(`tagboard:${code}`, doc, {
  signaling: loadSignalingUrls(), // [ "wss://turn.0docker.com/ws" ]
  password: optionalRoomPassword, // XSalsa20 to signaling
  peerOpts: { config: { iceServers: turnState.iceServers } },
});
```

The Yjs CRDT (a `Y.Map<tagId, TagNote[]>`) replicates over WebRTC data channels. The signaling server only sees encrypted (or — without a password — plaintext) y-webrtc protocol messages, never the camera frames.

AprilTag detection runs **entirely client-side** in the browser. Frames never leave the device.

## How to use your own deployment

Open Settings. Two fields, both backed by `localStorage`:

- `tagboard:signalingUrl` — defaults to `wss://turn.0docker.com/ws`
- `tagboard:turnTokenUrl` — defaults to `https://turn.0docker.com/credentials`

Reload after changing.

Build-time defaults:

```sh
VITE_WEBRTC_SIGNALING=wss://your.example/ws \
VITE_TURN_TOKEN_URL=https://your.example/credentials \
  npm run build
```

## Fallback behaviour

If the TURN token fetch fails or is empty, TagBoard falls back to STUN-only and warns. STUN-only works for ~70% of NAT pairs.

## AprilTag detection (no external service)

TagBoard uses [js-aruco2](https://github.com/damianofalcioni/js-aruco2), MIT-licensed, vendored under `public/aruco/`. The shipped `apriltag_36h11.js` dictionary contains 587 unique markers — exactly the dictionary the AprilTag reference C library produces.

There is no remote ML service, no cloud detection API, no telemetry. Camera frames stay in your tab.

## Reference apps on the same stack

- [anon-conf-poll](https://github.com/baditaflorin/anon-conf-poll) — anonymous live polling with Semaphore proofs.
- [cursorparty](https://github.com/baditaflorin/cursorparty) — shared cursors + sticky notes (sibling app).
- [pockettalkie](https://github.com/baditaflorin/pockettalkie) — encrypted push-to-talk (sibling app).
- [physical-kanban-sync](https://github.com/baditaflorin/physical-kanban-sync) — AprilTag-scanned kanban with CRDT state.
