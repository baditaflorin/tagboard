# TagBoard

AprilTag-anchored AR sticky notes. Print a marker, point your phone camera at it, and shared notes appear pinned to that marker for everyone in the room. No signup, no backend, ephemeral.

→ <https://baditaflorin.github.io/tagboard/>

## What it is

Each physical AprilTag (36h11 family) becomes a shared anchor. The room state is a Yjs CRDT keyed by tag id, replicated peer-to-peer over the maintainer's self-hosted WebRTC mesh.

Use cases:

- **Classroom tabletop** — students print 4 tags, walk between them, drop notes.
- **Escape room** — tags hidden around a venue carry context-specific clues.
- **Museum tour** — visitors point at tags by exhibits, see crowd-sourced notes.
- **Workshop** — sticky-note voting attached to physical posters.

## How to use

1. Open the URL, start a room or join one.
2. Tap **🏷 Print tag** to print one or more AprilTag markers (36h11). Pick distinct ids — each id is a separate shared anchor.
3. Grant camera permission. Point at a printed tag.
4. The detected tag gets a green outline and a green badge. Tap the badge to add notes.
5. Share the QR — anyone else in the room sees the same notes attached to the same tags.

## Self-hosted infrastructure

TagBoard has no backend of its own. It uses the maintainer's WebRTC stack on a single Hetzner VPS at `turn.0docker.com`:

| Repo                                                                   | Endpoint                               | Purpose                             |
| ---------------------------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| [signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol WebSocket fan-out |
| [turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | HMAC TURN creds, 1-hour TTL         |
| [coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479`           | TURN relay                          |

The **Settings** panel lets you point at your own stack. If TURN is unavailable the app falls back to STUN-only with a warning.

See [docs/self-hosted-infra.md](docs-src/self-hosted-infra.md) for the full integration pattern.

## Threat model

Read [docs/privacy.md](docs-src/privacy.md). Summary:

- Anyone with the room code can see and write notes.
- With a room password, y-webrtc encrypts wire traffic to signaling with XSalsa20.
- The maintainer's signaling/TURN servers cannot read note contents when the room password is set.
- AprilTag detection runs entirely in your browser. Frames are not uploaded anywhere.

## AprilTag detection

TagBoard uses the [js-aruco2](https://github.com/damianofalcioni/js-aruco2) MIT-licensed library, vendored in `public/aruco/`. The shipped AprilTag 36h11 dictionary contains 587 unique tag ids — same dictionary the AprilTag reference C library produces.

The detection runs at ~10–15 fps on a mid-range phone at 640×360. Tag positions are smoothed with an exponential filter so notes don't jitter.

## Develop

```
npm install
npm run dev
```

Open <http://localhost:5175>. The app needs HTTPS (or `localhost`) for `getUserMedia` to work.

To test multi-peer: open the URL on two devices, share the room code via QR, point both at the same printed tag.

## Build for GitHub Pages

```
npm run build
```

Outputs to `docs/`. Commit and Pages serves. No GitHub Actions — `npm run smoke` is the local CI gated by the pre-commit hook.

## Reference apps copied from

- [anon-conf-poll](https://github.com/baditaflorin/anon-conf-poll) — `turnConfig.ts`, signaling URL handling, Settings pattern.
- [physical-kanban-sync](https://github.com/baditaflorin/physical-kanban-sync) — AprilTag-keyed CRDT state.

## License

MIT.
