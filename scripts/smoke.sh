#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

if [ ! -f docs/index.html ]; then
  echo "smoke: docs/index.html missing"
  exit 1
fi
if ! ls docs/assets/*.js >/dev/null 2>&1; then
  echo "smoke: no JS bundle in docs/assets"
  exit 1
fi
if [ ! -f docs/aruco/aruco.js ] || [ ! -f docs/aruco/cv.js ]; then
  echo "smoke: vendored js-aruco2 missing from docs/aruco/"
  exit 1
fi
if [ ! -f docs/aruco/dictionaries/apriltag_36h11.js ]; then
  echo "smoke: AprilTag dictionary missing"
  exit 1
fi
echo "smoke: OK"
