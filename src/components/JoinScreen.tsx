import { useState } from "react";
import { makeRoomCode, normalizeRoomCode } from "../lib/room";
import { QRScanner } from "../lib/qr";

export function JoinScreen({
  onJoin,
}: {
  onJoin: (code: string, password: string | undefined) => void;
}) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [scanning, setScanning] = useState(false);

  function startNew() {
    onJoin(makeRoomCode(), password || undefined);
  }
  function joinExisting() {
    const cleaned = normalizeRoomCode(code);
    if (cleaned.length < 4) return;
    onJoin(cleaned, password || undefined);
  }
  function handleScan(text: string) {
    setScanning(false);
    try {
      const url = new URL(text);
      const hash = url.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const r = params.get("r");
      const k = params.get("k") ?? "";
      if (r) {
        onJoin(normalizeRoomCode(r), k || undefined);
        return;
      }
    } catch {
      /* not a URL */
    }
    const cleaned = normalizeRoomCode(text);
    if (cleaned.length >= 4) onJoin(cleaned, password || undefined);
  }

  return (
    <div className="app-shell" style={{ justifyContent: "center" }}>
      <div
        style={{
          background: "var(--bg-soft)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>🏷 TagBoard</h1>
        <small style={{ color: "var(--fg-dim)" }}>
          Print an AprilTag, point your camera at it, and shared sticky notes appear
          anchored to the marker. Everyone in the room sees the same notes on the same
          tag.
        </small>

        <button className="primary" onClick={startNew}>
          Start a new room
        </button>

        <div className="row" style={{ gap: 8, display: "flex" }}>
          <input
            placeholder="or enter room code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinExisting()}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button onClick={joinExisting} disabled={normalizeRoomCode(code).length < 4}>
            Join
          </button>
        </div>

        <button onClick={() => setScanning(true)}>📷 Scan QR</button>

        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--fg-dim)" }}>
            Optional room password
          </summary>
          <div style={{ marginTop: 8 }}>
            <input
              placeholder="Room password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>y-webrtc encrypts wire traffic with this password (XSalsa20).</small>
          </div>
        </details>
      </div>

      {scanning && <QRScanner onResult={handleScan} onClose={() => setScanning(false)} />}
    </div>
  );
}
