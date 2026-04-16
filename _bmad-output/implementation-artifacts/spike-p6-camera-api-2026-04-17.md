# Camera API (getUserMedia) — Spike Report

**Date:** 2026-04-17
**For:** Story 2.1 — CameraCapture component (UX-DR4)

---

## getUserMedia API

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: { ideal: "environment" }, // rear camera on mobile
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
});
```

**Availability:** All modern browsers (Chrome 53+, Firefox 36+, Safari 11+, Edge 12+).
**Requires HTTPS** in production — `localhost` is exempt.

---

## Mobile Browser Compatibility

| Browser | iOS Safari | Chrome Android | Firefox Android |
|---------|-----------|----------------|-----------------|
| getUserMedia | ✅ 11+ | ✅ | ✅ |
| facingMode: environment | ✅ | ✅ | ✅ |
| Permission persistence | ❌ re-asks each load | ✅ sticky | ✅ sticky |
| HTTPS required | ✅ | ✅ | ✅ |

**iOS Safari caveat:** Permission is NOT sticky — user must re-grant on every page load.
Mitigation: Keep the camera session open as long as possible; don't re-open unnecessarily.

---

## Document Corner Detection

### Option A: OpenCV.js (NOT recommended for MVP)
- Bundle size: ~8MB WASM
- Works but heavy; good for SO answers, brittle in production
- Corner detection accuracy is inconsistent without tuning

### Option B: CSS + JS heuristic overlay (recommended for MVP)
- Show a document frame overlay (dashed border) as a visual guide
- Detect "stable frame" by comparing successive canvas frames
- If pixel diff between frame N and N-1 falls below threshold for 500ms → auto-capture
- No external library needed; works on all browsers
- Implementation: `requestAnimationFrame` loop + `canvas.getContext('2d').drawImage(video)`

```ts
// Simplified stable-frame detection
let stableFrames = 0;
const STABLE_THRESHOLD = 15; // ~500ms at 30fps

function checkStability(prevData: ImageData, currData: ImageData): boolean {
  let diff = 0;
  for (let i = 0; i < currData.data.length; i += 4) {
    diff += Math.abs(currData.data[i]! - prevData.data[i]!);
  }
  return diff / (currData.data.length / 4) < 5; // avg pixel diff < 5
}
```

### Option C: Dynamsoft Document Viewer SDK (commercial)
- Accurate corner detection + perspective correction
- Paid license — not suitable for MVP

**Decision: Option B for MVP.** Implement visual guide overlay + stable-frame auto-capture.
OpenCV.js deferred to post-MVP if accuracy requirements increase.

---

## JPEG Compression (max 2MB per Story 2.1)

```ts
function captureFrame(video: HTMLVideoElement, maxBytes = 2 * 1024 * 1024): Blob {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);

  // Binary search for quality that fits under maxBytes
  let lo = 0.1, hi = 0.95, blob: Blob | null = null;
  // In practice: start at 0.85 quality; resize if still too large
  return canvas.toBlob((b) => { blob = b; }, "image/jpeg", 0.85)!;
}
```

---

## Story 2.1 Implementation Plan

1. `<video>` element with `srcObject = stream` for viewfinder
2. Document guide overlay: CSS dashed border (centered, A4 aspect ratio)
3. Stable-frame detection loop via `requestAnimationFrame`
4. Auto-capture on 500ms stability OR manual shutter button (56px, UX-DR4)
5. JPEG compression to ≤2MB via `canvas.toBlob()`
6. Stop all tracks on unmount: `stream.getTracks().forEach(t => t.stop())`
7. Gallery fallback: `<input type="file" accept="image/*,application/pdf,.xml">`

---

## Open Time < 500ms (NFR6)

- Call `getUserMedia()` on component mount, not on button click
- Show loading skeleton until `video.readyState === HAVE_ENOUGH_DATA`
- Avoid re-requesting permission — cache stream reference in component state

---

## Offline Queue (UX-DR4)

Story 2.1 requires IndexedDB + Service Worker for offline capture queue.
This is a separate spike — Camera API itself is online-only.
Service Worker setup deferred to Story 2.1 implementation.
