import { useEffect, useRef, useState } from "react";
import { drawTag, maxTagId } from "../lib/printTag";

export function PrintTag({ onClose }: { onClose: () => void }) {
  const [id, setId] = useState(0);
  const [max, setMax] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setMax(maxTagId());
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      drawTag(canvasRef.current, id, 480);
    } catch (err) {
      console.warn("[print] draw failed", err);
    }
  }, [id]);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `apriltag-36h11-${id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function printIt() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <!doctype html>
      <html><head><title>AprilTag 36h11 #${id}</title>
        <style>
          @page { margin: 1in; }
          body { font-family: sans-serif; text-align: center; }
          img { width: 4in; height: 4in; image-rendering: pixelated; }
          .meta { color: #555; font-size: 11pt; margin-top: 8px; }
        </style>
      </head><body>
        <img src="${dataUrl}" alt="AprilTag 36h11 #${id}" />
        <div class="meta">AprilTag 36h11 — id #${id}</div>
        <script>setTimeout(() => window.print(), 200);</script>
      </body></html>
    `);
    w.document.close();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Print an AprilTag</h2>
          <button onClick={onClose}>close</button>
        </div>

        <small>
          Print this on paper. Point your phone camera at it inside the room and shared
          sticky notes will anchor to it. Each tag id is a separate anchor — print several
          to have multiple boards.
        </small>

        <div className="row">
          <label style={{ flex: 1 }}>
            Tag id (0–{max})
            <input
              type="number"
              min={0}
              max={max}
              value={id}
              onChange={(e) =>
                setId(Math.max(0, Math.min(max, Number(e.target.value) | 0)))
              }
            />
          </label>
        </div>

        <div className="print-tag">
          <canvas ref={canvasRef} style={{ width: 240, height: 240 }} />
          <div className="meta">AprilTag 36h11 · id {id}</div>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button onClick={downloadPng}>Download PNG</button>
          <button className="primary" onClick={printIt}>
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
