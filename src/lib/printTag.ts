// Render an AprilTag 36h11 marker to a canvas, large and printable.
// Reads the bit pattern out of the vendored js-aruco2 dictionary.

import { DICTIONARY } from "./detector";

export function drawTag(canvas: HTMLCanvasElement, id: number, pixelSize = 600): void {
  if (typeof window.AR === "undefined") {
    throw new Error("js-aruco2 not loaded");
  }
  const dict = window.AR.DICTIONARIES[DICTIONARY];
  if (!dict) throw new Error(`dictionary ${DICTIONARY} not found`);
  const nBits = dict.nBits;
  const side = Math.sqrt(nBits); // 6 for 36h11
  if (!Number.isInteger(side)) throw new Error("non-square dictionary");
  const code = dict.codeList[id];
  if (code === undefined) throw new Error(`id ${id} out of range for ${DICTIONARY}`);

  // Convert big-int code into the bit grid.
  const bits: number[] = [];
  for (let i = nBits - 1; i >= 0; i--) {
    // Each code is a number (or big BigInt-like); JS handles up to 2^53.
    // 36h11 codes fit in a Number (max ~2^36). Safe.
    bits.push(Number((BigInt(code) >> BigInt(i)) & 1n));
  }

  // Marker layout: 1-cell white quiet zone is added by the printable wrapper,
  // not encoded here. The AprilTag spec includes a 1-cell black border.
  const total = side + 2; // include the 1-cell black border
  const cell = Math.floor(pixelSize / total);
  const W = cell * total;

  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = "#fff";

  let bitIdx = 0;
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      const v = bits[bitIdx++];
      if (v === 1) {
        ctx.fillRect((c + 1) * cell, (r + 1) * cell, cell, cell);
      }
    }
  }
}

export function maxTagId(): number {
  if (typeof window.AR === "undefined") return 0;
  const dict = window.AR.DICTIONARIES[DICTIONARY];
  return dict ? dict.codeList.length - 1 : 0;
}
