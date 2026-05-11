// Type shims for the vendored js-aruco2 globals loaded via <script> tags in
// index.html. The library registers `window.AR` and `window.CV`.
//
// js-aruco2: github.com/damianofalcioni/js-aruco2 (MIT).

export {};

type Point = { x: number; y: number };

declare global {
  interface ArucoMarker {
    id: number;
    corners: Point[];
    hammingDistance: number;
    dictionaryName: string;
  }

  class ArucoDetector {
    constructor(opts?: { dictionaryName?: string; maxHammingDistance?: number });
    detect(imageData: ImageData): ArucoMarker[];
  }

  interface Window {
    AR: {
      Detector: typeof ArucoDetector;
      Dictionary: new (name: string) => unknown;
      DICTIONARIES: Record<string, { nBits: number; tau: number; codeList: number[] }>;
    };
    CV: unknown;
  }
}
