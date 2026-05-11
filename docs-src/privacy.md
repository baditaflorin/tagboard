# Privacy & threat model

TagBoard is anonymous and ephemeral by design. No signup, no identity persisted across sessions. State lives in connected browsers; close all tabs and the room is gone.

## What other peers in your room see

- Every sticky note attached to every tag id that anyone in the room has touched.
- Note author name and colour (random per session).
- Yjs peer presence (random UUID per tab).

There is no privacy _within_ a room — assume any note you write is visible to every other peer with the room code.

Other peers do **not** see your camera feed. Camera frames never leave your device.

## What the signaling server sees

The signaling server (`wss://turn.0docker.com/ws` by default) is a generic y-webrtc fan-out:

- The room topic (`tagboard:<roomCode>`).
- Peer counts via the subscriber list.

**If you set a room password:** y-webrtc encrypts every signaling message and every CRDT update with XSalsa20 keyed on `PBKDF2(password)`. The server sees opaque blobs.

**If you do not set a room password:** the server can read the Yjs updates (which include note text, author names, tag ids) and the SDP/ICE for peer connections.

The maintainer's signaling server does not log message bodies and does not run analytics.

## What the TURN relay sees

When peers cannot connect directly, TURN relays DTLS-encrypted WebRTC packets. The relay sees:

- Source and destination IPs.
- DTLS-encrypted bytes (note text, etc., are inside a DTLS-SRTP channel and unreadable to the relay).

Point Settings at your own coturn deployment to remove this trust dependency.

## What runs in your browser only

- **Camera frames** — captured via `getUserMedia` and processed in-browser. Never uploaded.
- **AprilTag detection** — js-aruco2 (vendored, MIT). All pixels stay on-device.
- **CRDT updates** — Yjs encodes note add/delete operations and sends them over WebRTC data channels (peer-to-peer) and via the signaling server's pub/sub.

## What we do not do

- No service worker — hard refresh always gets the latest code.
- No localStorage of notes or images.
- No third-party analytics. No Sentry. No telemetry.
- No identity persisted across sessions.
- No remote ML or cloud vision API.
- No camera frame recording, no transcripts.

## Encryption details

- **Signaling:** TLS to `wss://turn.0docker.com/ws`. y-webrtc adds XSalsa20 with a password-derived key when set.
- **Peer-to-peer Yjs:** DTLS over the WebRTC data channel.
- **TURN:** when used, sees only DTLS-encrypted bytes.

There is no application-layer encryption on top of DTLS for the Yjs data channel beyond y-webrtc's room password. If you don't trust the maintainer's TURN relay infrastructure, run your own coturn.

## Caveats

- The room code is in your URL hash. URL hashes are not sent to servers, but browser sync (Chrome Sync, iCloud Tabs) may sync URLs across your own devices.
- Anyone with the room code can write or delete their own notes. (Note deletion is currently scoped to author; whole-room moderation is not implemented.)
- AprilTag detection accuracy depends on lighting and print quality. Tags require a quiet white border to be reliably detected.
- The phone needs HTTPS or `localhost` for `getUserMedia` to work — GitHub Pages serves over HTTPS, so this is satisfied for production.
