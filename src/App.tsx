import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import { ShareCard } from "./components/ShareCard";
import { Settings } from "./components/Settings";
import { PrintTag } from "./components/PrintTag";
import { TagNotesModal } from "./components/TagNotesModal";
import { makeLocalUser, type LocalUser } from "./lib/identity";
import {
  buildShareUrl,
  readPasswordFromUrl,
  readRoomFromUrl,
  writeUrlHash,
} from "./lib/room";
import { joinRoom, type Room, type TagNote } from "./lib/yjsRoom";
import { detectTags, type DetectedTag } from "./lib/detector";

type Status = "idle" | "camera-pending" | "connecting" | "alone" | "online";

type LiveTag = DetectedTag & { lastSeen: number; smoothCenter: { x: number; y: number } };

const TAG_TTL_MS = 600; // keep showing notes briefly after detection drops
const SMOOTHING = 0.35;

export default function App() {
  const [user] = useState<LocalUser>(() => makeLocalUser());
  const [roomCode, setRoomCode] = useState<string | null>(() => readRoomFromUrl());
  const [password, setPassword] = useState<string | undefined>(
    () => readPasswordFromUrl() ?? undefined,
  );
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [turnWarning, setTurnWarning] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [openTag, setOpenTag] = useState<number | null>(null);

  const [liveTags, setLiveTags] = useState<Map<number, LiveTag>>(new Map());
  const [notesByTag, setNotesByTag] = useState<Map<number, TagNote[]>>(new Map());
  const [peerCount, setPeerCount] = useState(0);
  const [arucoLoaded, setArucoLoaded] = useState<boolean>(
    typeof window !== "undefined" && typeof window.AR !== "undefined",
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const liveTagsRef = useRef<Map<number, LiveTag>>(new Map());
  const stageRef = useRef<HTMLDivElement>(null);
  const detectingRef = useRef(false);
  const rafRef = useRef<number>(0);

  // Verify js-aruco2 globals are loaded; the script tags in index.html should
  // have run before this React tree mounts.
  useEffect(() => {
    if (arucoLoaded) return;
    let tries = 0;
    const tick = () => {
      if (typeof window.AR !== "undefined") {
        setArucoLoaded(true);
        return;
      }
      if (++tries > 50) return; // ~5s
      setTimeout(tick, 100);
    };
    tick();
  }, [arucoLoaded]);

  // Join Yjs room.
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    let r: Room | null = null;
    setStatus("camera-pending");
    (async () => {
      r = await joinRoom(roomCode, password);
      if (cancelled) {
        r.destroy();
        return;
      }
      setRoom(r);
      writeUrlHash(roomCode, password);
      if (!r.turnState.hasRelay) {
        setTurnWarning(
          "TURN relay unavailable — falling back to STUN only. Cross-NAT sync may fail.",
        );
      }
      const refresh = () => {
        const m = new Map<number, TagNote[]>();
        r!.notesByTag.forEach((notes, key) => {
          const id = parseInt(key, 10);
          if (!Number.isNaN(id)) m.set(id, notes);
        });
        setNotesByTag(m);
      };
      refresh();
      r.notesByTag.observe(refresh);

      const awareness = r.provider.awareness;
      awareness.setLocalStateField("user", {
        id: user.id,
        name: user.name,
        color: user.color,
      });
      const onChange = () => {
        setPeerCount(Math.max(0, awareness.getStates().size - 1));
      };
      onChange();
      awareness.on("change", onChange);
    })().catch((err) => {
      console.error("[room] join failed", err);
    });

    return () => {
      cancelled = true;
      r?.destroy();
      setRoom(null);
      setNotesByTag(new Map());
    };
  }, [roomCode, password, user]);

  // Camera + detection loop.
  useEffect(() => {
    if (!roomCode || !arucoLoaded) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCameraError(null);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        // Detection canvas (hidden, used to pull pixel data each frame).
        if (!sampleCanvasRef.current) {
          sampleCanvasRef.current = document.createElement("canvas");
        }
        detectingRef.current = true;
        scheduleNextDetect();
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : String(err));
      }
    })();

    function scheduleNextDetect() {
      if (!detectingRef.current) return;
      rafRef.current = requestAnimationFrame(detectFrame);
    }

    function detectFrame() {
      if (!detectingRef.current) return;
      const video = videoRef.current;
      const canvas = sampleCanvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        scheduleNextDetect();
        return;
      }
      // Downsample to ~480p for detection — js-aruco2 isn't super fast at HD.
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(1, 640 / Math.max(vw, vh));
      const sw = Math.max(1, Math.round(vw * scale));
      const sh = Math.max(1, Math.round(vh * scale));
      if (canvas.width !== sw) canvas.width = sw;
      if (canvas.height !== sh) canvas.height = sh;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        scheduleNextDetect();
        return;
      }
      ctx.drawImage(video, 0, 0, sw, sh);

      let detections: DetectedTag[];
      try {
        const imageData = ctx.getImageData(0, 0, sw, sh);
        detections = detectTags(imageData);
      } catch (err) {
        console.warn("[detect] failed", err);
        scheduleNextDetect();
        return;
      }

      // Scale back to source pixels for overlay calculations.
      const upscale = 1 / scale;
      const now = performance.now();
      const prev = liveTagsRef.current;
      const next = new Map<number, LiveTag>();

      for (const d of detections) {
        const cx = d.center.x * upscale;
        const cy = d.center.y * upscale;
        const existing = prev.get(d.id);
        const smooth = existing
          ? {
              x: existing.smoothCenter.x * (1 - SMOOTHING) + cx * SMOOTHING,
              y: existing.smoothCenter.y * (1 - SMOOTHING) + cy * SMOOTHING,
            }
          : { x: cx, y: cy };
        next.set(d.id, {
          id: d.id,
          corners: d.corners.map((c) => ({ x: c.x * upscale, y: c.y * upscale })),
          center: { x: cx, y: cy },
          size: d.size * upscale,
          smoothCenter: smooth,
          lastSeen: now,
        });
      }
      // Carry forward tags that disappeared briefly.
      for (const [id, tag] of prev) {
        if (next.has(id)) continue;
        if (now - tag.lastSeen < TAG_TTL_MS) {
          next.set(id, tag);
        }
      }

      liveTagsRef.current = next;
      setLiveTags(new Map(next));
      drawOverlay(video, next);
      scheduleNextDetect();
    }

    return () => {
      cancelled = true;
      detectingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [roomCode, arucoLoaded]);

  // Status derivation
  useEffect(() => {
    if (!room) return;
    if (peerCount > 0) setStatus("online");
    else setStatus("alone");
  }, [room, peerCount]);

  const addNote = useCallback(
    (tagId: number, text: string) => {
      if (!room) return;
      const key = String(tagId);
      const existing = room.notesByTag.get(key) ?? [];
      const note: TagNote = {
        id: crypto.randomUUID(),
        text,
        authorId: user.id,
        authorName: user.name,
        authorColor: user.color,
        createdAt: Date.now(),
      };
      room.notesByTag.set(key, [...existing, note]);
    },
    [room, user],
  );

  const deleteNote = useCallback(
    (tagId: number, noteId: string) => {
      if (!room) return;
      const key = String(tagId);
      const existing = room.notesByTag.get(key) ?? [];
      const next = existing.filter((n) => n.id !== noteId);
      if (next.length === 0) {
        room.notesByTag.delete(key);
      } else {
        room.notesByTag.set(key, next);
      }
    },
    [room],
  );

  const shareUrl = useMemo(
    () => (roomCode ? buildShareUrl(roomCode, password) : ""),
    [roomCode, password],
  );

  function leave() {
    setRoomCode(null);
    setPassword(undefined);
    setLiveTags(new Map());
    setNotesByTag(new Map());
    setTurnWarning(null);
    history.replaceState(null, "", window.location.pathname);
  }

  if (!roomCode) {
    return (
      <>
        <JoinScreen
          onJoin={(c, pw) => {
            setRoomCode(c);
            setPassword(pw);
          }}
        />
        <button
          onClick={() => setShowSettings(true)}
          style={{ position: "fixed", bottom: 12, right: 12 }}
        >
          ⚙ Settings
        </button>
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </>
    );
  }

  const stageRect = stageRef.current?.getBoundingClientRect();

  return (
    <>
      <div ref={stageRef} className="stage">
        <video ref={videoRef} playsInline muted />
        <canvas ref={overlayRef} className="overlay" />

        {/* Note overlays positioned at smoothed tag centers, mapped from
            source-video coordinates into the video element's screen rect via
            object-fit: cover math. */}
        {stageRect &&
          [...liveTags.values()].map((tag) => {
            const screen = mapVideoToScreen(
              tag.smoothCenter.x,
              tag.smoothCenter.y,
              videoRef.current,
              stageRect,
            );
            if (!screen) return null;
            const notes = notesByTag.get(tag.id) ?? [];
            return (
              <div
                key={tag.id}
                className="tag-anchor"
                style={{ left: screen.x, top: screen.y }}
              >
                <button
                  className="badge"
                  onClick={() => setOpenTag(tag.id)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    pointerEvents: "auto",
                  }}
                >
                  tag {tag.id} · {notes.length}
                </button>
                <div className="notes">
                  {notes.slice(0, 4).map((n) => (
                    <div key={n.id} className="tag-note">
                      <div className="swatch" style={{ background: n.authorColor }} />
                      <div style={{ flex: 1 }}>
                        <div>{n.text}</div>
                        <div className="author">{n.authorName}</div>
                      </div>
                    </div>
                  ))}
                  {notes.length > 4 && (
                    <button
                      onClick={() => setOpenTag(tag.id)}
                      style={{ fontSize: 11, alignSelf: "flex-start" }}
                    >
                      +{notes.length - 4} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <div className="hud">
        <div className="panel">
          <span
            className={`status-dot ${
              status === "online" ? "ok" : status === "alone" ? "warn" : "bad"
            }`}
          />
          <span>
            {status === "online"
              ? `${peerCount} peer${peerCount === 1 ? "" : "s"}`
              : status === "alone"
                ? "alone"
                : "connecting…"}
          </span>
          <span style={{ color: "var(--fg-dim)" }}>
            room <strong style={{ color: "var(--fg)" }}>{roomCode}</strong>
          </span>
          <span style={{ color: user.color, fontSize: 11 }}>{user.name}</span>
        </div>
        <div className="panel" style={{ marginLeft: "auto" }}>
          tags seen: <strong>{liveTags.size}</strong>
        </div>
      </div>

      {cameraError && (
        <div
          className="warning-banner"
          style={{ position: "fixed", top: 64, left: 12, right: 12, zIndex: 10 }}
        >
          Camera error: {cameraError}. Tap reload after granting permission.
        </div>
      )}
      {turnWarning && (
        <div
          className="warning-banner"
          style={{ position: "fixed", top: 100, left: 12, right: 12, zIndex: 10 }}
        >
          {turnWarning}
        </div>
      )}
      {!arucoLoaded && (
        <div
          className="warning-banner"
          style={{ position: "fixed", top: 64, left: 12, right: 12, zIndex: 10 }}
        >
          AprilTag detector still loading…
        </div>
      )}

      <div className="toolbar">
        <button onClick={() => setShowPrint(true)}>🏷 Print tag</button>
        <button onClick={() => setShowShare(true)}>📤 Share</button>
        <button onClick={() => setShowSettings(true)}>⚙</button>
        <button onClick={leave}>← Leave</button>
      </div>

      {showShare && (
        <ShareCard
          url={shareUrl}
          roomCode={roomCode}
          onClose={() => setShowShare(false)}
        />
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showPrint && <PrintTag onClose={() => setShowPrint(false)} />}
      {openTag !== null && (
        <TagNotesModal
          tagId={openTag}
          notes={notesByTag.get(openTag) ?? []}
          myUserId={user.id}
          onAdd={(text) => addNote(openTag, text)}
          onDelete={(noteId) => deleteNote(openTag, noteId)}
          onClose={() => setOpenTag(null)}
        />
      )}
    </>
  );
}

// Map a point in video-source coordinates to screen coordinates over the
// video element (which uses object-fit: cover). Returns null if video size is
// not available yet.
function mapVideoToScreen(
  vx: number,
  vy: number,
  video: HTMLVideoElement | null,
  stageRect: DOMRect,
): { x: number; y: number } | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sw = stageRect.width;
  const sh = stageRect.height;
  // object-fit: cover scale: max ratio fills the box.
  const scale = Math.max(sw / vw, sh / vh);
  const displayedW = vw * scale;
  const displayedH = vh * scale;
  const offsetX = (sw - displayedW) / 2;
  const offsetY = (sh - displayedH) / 2;
  return { x: offsetX + vx * scale, y: offsetY + vy * scale };
}

function drawOverlay(video: HTMLVideoElement | null, tags: Map<number, LiveTag>) {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas.overlay");
  if (!canvas || !video) return;
  const stage = canvas.parentElement;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  if (canvas.width !== rect.width) canvas.width = rect.width;
  if (canvas.height !== rect.height) canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(74, 222, 128, 0.85)";
  for (const tag of tags.values()) {
    const pts = tag.corners
      .map((c) => mapVideoToScreen(c.x, c.y, video, rect))
      .filter((p): p is { x: number; y: number } => p !== null);
    if (pts.length < 4) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
  }
}
