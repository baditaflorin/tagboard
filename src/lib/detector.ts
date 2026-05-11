// Thin wrapper over the vendored js-aruco2 detector. We default to the
// AprilTag 36h11 dictionary (the most common AR fiducial family).

export const DICTIONARY = "APRILTAG_36h11";

export type DetectedTag = {
  id: number;
  corners: { x: number; y: number }[];
  center: { x: number; y: number };
  size: number; // average edge length in source pixels
};

let detectorInstance: ArucoDetector | null = null;

function ensureDetector(): ArucoDetector {
  if (!detectorInstance) {
    if (typeof window.AR === "undefined") {
      throw new Error("js-aruco2 globals not loaded (window.AR missing)");
    }
    detectorInstance = new window.AR.Detector({
      dictionaryName: DICTIONARY,
      maxHammingDistance: 0,
    });
  }
  return detectorInstance;
}

export function detectTags(imageData: ImageData): DetectedTag[] {
  const detector = ensureDetector();
  const markers = detector.detect(imageData);
  return markers.map((m) => {
    const cx = (m.corners[0].x + m.corners[2].x) / 2;
    const cy = (m.corners[0].y + m.corners[2].y) / 2;
    const w = Math.hypot(
      m.corners[1].x - m.corners[0].x,
      m.corners[1].y - m.corners[0].y,
    );
    const h = Math.hypot(
      m.corners[3].x - m.corners[0].x,
      m.corners[3].y - m.corners[0].y,
    );
    return {
      id: m.id,
      corners: m.corners.map((c) => ({ x: c.x, y: c.y })),
      center: { x: cx, y: cy },
      size: (w + h) / 2,
    };
  });
}
