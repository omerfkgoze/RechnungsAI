"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, FolderOpen, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  INVOICE_ACCEPTED_MIME,
  MAX_IMAGE_JPEG_BYTES,
  invoiceUploadInputSchema,
} from "@rechnungsai/shared";
import {
  selectFailedCount,
  selectPendingCount,
  selectUploadedCount,
  useCaptureStore,
  type QueuedCapture as StoreEntry,
} from "@/lib/stores/capture-store";
import {
  enqueueCapture,
  listPending,
  markFailed as queueMarkFailed,
  markUploaded as queueMarkUploaded,
  markUploading as queueMarkUploading,
  requeueFailed,
  requeueUploading,
} from "@/lib/offline/invoice-queue";
import { registerInvoiceSW } from "@/lib/offline/register-sw";
import { uploadInvoice } from "@/app/actions/invoices";

const ACCEPT_ATTR = INVOICE_ACCEPTED_MIME.join(",");

type FallbackReason = "permission" | "https" | "unsupported" | null;

function inferMime(name: string, fallback: string): string {
  if (fallback && (INVOICE_ACCEPTED_MIME as readonly string[]).includes(fallback))
    return fallback;
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xml")) return "application/xml";
  return fallback;
}

async function compressJpeg(
  canvas: HTMLCanvasElement,
): Promise<Blob | null> {
  const attempts: Array<{ quality: number; scale: number }> = [
    { quality: 0.85, scale: 1 },
    { quality: 0.7, scale: 1 },
    { quality: 0.55, scale: 1 },
    { quality: 0.75, scale: 0.75 },
  ];
  for (const { quality, scale } of attempts) {
    const target = document.createElement("canvas");
    target.width = Math.round(canvas.width * scale);
    target.height = Math.round(canvas.height * scale);
    const ctx = target.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      target.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (blob && blob.size <= MAX_IMAGE_JPEG_BYTES) return blob;
    if (blob && scale === 0.75) {
      return null; // still oversize after all attempts — caller shows amber error
    }
  }
  return null;
}

export function CameraCaptureShell() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stableCountRef = useRef(0);
  const captureLockRef = useRef(false);
  // Auto-capture starts disarmed: the user must first frame the document
  // (which produces motion → arms the loop) and then hold still. Without
  // this, a motionless scene at mount triggers an immediate capture before
  // the user has pointed the camera anywhere meaningful. Re-arms after each
  // fire only once UNSTABLE_THRESHOLD motion is seen for UNSTABLE_FRAMES
  // consecutive frames. Manual shutter bypasses this gate entirely.
  const armedRef = useRef(false);
  const unstableCountRef = useRef(0);
  // Paused while the native file picker (gallery) is open so the RAF loop
  // does not fire auto-captures behind the modal.
  const galleryOpenRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fallback, setFallback] = useState<FallbackReason>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pop, setPop] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const addToQueue = useCaptureStore((s) => s.addToQueue);
  const markUploading = useCaptureStore((s) => s.markUploading);
  const markUploaded = useCaptureStore((s) => s.markUploaded);
  const markFailed = useCaptureStore((s) => s.markFailed);
  const setRedirectAfterUpload = useCaptureStore((s) => s.setRedirectAfterUpload);
  const uploadedCount = useCaptureStore(selectUploadedCount);
  const pendingCount = useCaptureStore(selectPendingCount);
  const failedCount = useCaptureStore(selectFailedCount);

  // ─── Upload worker ─────────────────────────────────────────────
  // Reads `redirectAfterUpload` from the store at call time. The drain path
  // sets the flag false before processing and restores it after (AC #8a).
  const uploadOne = useCallback(
    async (entry: StoreEntry, blob: Blob) => {
      const redirect = useCaptureStore.getState().redirectAfterUpload;
      markUploading(entry.id);
      await queueMarkUploading(entry.id);
      const fd = new FormData();
      const file = new File([blob], entry.originalFilename, {
        type: entry.fileType,
      });
      fd.set("file", file);
      // AC#8: max 3 retries, linear backoff 1s / 3s / 5s (4 total attempts).
      const retryDelays = [1000, 3000, 5000];
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
          const res = await uploadInvoice(fd);
          if (res.success) {
            markUploaded(entry.id, res.data.invoiceId);
            await queueMarkUploaded(entry.id);
            if (redirect) {
              router.push(`/rechnungen/${res.data.invoiceId}`);
            }
            return;
          }
          if (attempt === retryDelays.length) {
            markFailed(entry.id, res.error);
            await queueMarkFailed(entry.id, res.error);
            return;
          }
        } catch (err) {
          if (attempt === retryDelays.length) {
            const msg =
              err instanceof Error ? err.message : "Upload fehlgeschlagen.";
            markFailed(entry.id, msg);
            await queueMarkFailed(entry.id, msg);
            return;
          }
        }
        await new Promise<void>((r) =>
          setTimeout(r, retryDelays[attempt] ?? 1000),
        );
      }
    },
    [markFailed, markUploaded, markUploading, router],
  );

  const drainQueue = useCallback(async () => {
    // Offline-drain path: upload many rows without navigating away (AC #8a).
    // Set redirectAfterUpload=false for the duration of the drain so uploadOne
    // does not navigate; restore to true afterwards.
    setRedirectAfterUpload(false);
    try {
      await requeueUploading();
      const pending = await listPending();
      for (const row of pending) {
        const entry: StoreEntry = {
          id: row.id,
          status: "queued",
          originalFilename: row.originalFilename,
          fileType: row.fileType,
          sizeBytes: row.sizeBytes,
          createdAt: row.createdAt,
        };
        await uploadOne(entry, row.blob);
      }
    } finally {
      setRedirectAfterUpload(true);
    }
  }, [uploadOne, setRedirectAfterUpload]);

  // ─── Capture (shared path for manual + auto + gallery) ────────
  const submitBlob = useCallback(
    async (blob: Blob, filename: string, mime: string) => {
      const parsed = invoiceUploadInputSchema.safeParse({
        originalFilename: filename,
        fileType: mime,
        sizeBytes: blob.size,
      });
      if (!parsed.success) {
        setInlineError(
          parsed.error.issues[0]?.message ??
            "Ungültige Datei. Bitte überprüfe dein Dokument.",
        );
        return;
      }
      setInlineError(null);
      const queueId = await enqueueCapture(blob, {
        originalFilename: filename,
        fileType: mime,
        sizeBytes: blob.size,
      });
      const entry: StoreEntry = {
        id: queueId,
        status: "queued",
        originalFilename: filename,
        fileType: mime,
        sizeBytes: blob.size,
        createdAt: Date.now(),
      };
      addToQueue(entry);
      setPop((n) => n + 1);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(30);
        } catch {
          // noop
        }
      }
      if (navigator.onLine) {
        await uploadOne(entry, blob);
      }
    },
    [addToQueue, uploadOne],
  );

  const snapFromVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || captureLockRef.current) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;
    captureLockRef.current = true;
    try {
      const canvas =
        captureCanvasRef.current ?? document.createElement("canvas");
      captureCanvasRef.current = canvas;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        captureLockRef.current = false;
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await compressJpeg(canvas);
      if (!blob) {
        setInlineError("Bild unscharf — bitte nochmal versuchen.");
        return;
      }
      await submitBlob(blob, `invoice-${Date.now()}.jpg`, "image/jpeg");
    } finally {
      captureLockRef.current = false;
    }
  }, [submitBlob]);

  // ─── Camera setup ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      setFallback("https");
      return;
    }
    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setFallback("unsupported");
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // If a track is stopped externally (e.g. phone call, another app
        // claiming the camera), disarm auto-capture and show the fallback.
        stream.getTracks().forEach((t) => {
          t.addEventListener(
            "ended",
            () => { if (!cancelled) setFallback("permission"); },
            { once: true },
          );
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          const trySetReady = () => {
            if (video.readyState >= 4) setVideoReady(true);
          };
          video.addEventListener("loadeddata", trySetReady);
          // canplaythrough guarantees readyState 4 — fallback for browsers
          // that fire loadeddata at readyState 2 and never re-fire.
          video.addEventListener("canplaythrough", trySetReady);
        }
      })
      .catch(() => {
        setFallback("permission");
      });
    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // ─── Stable-frame auto-capture loop ────────────────────────────
  useEffect(() => {
    if (!videoReady) return;
    const diff = diffCanvasRef.current ?? document.createElement("canvas");
    diffCanvasRef.current = diff;
    diff.width = 160;
    diff.height = 200;
    const ctx = diff.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const STABLE_THRESHOLD = 5;
    const STABLE_FRAMES = 15;
    // After a capture, the scene must meaningfully change (diff ≥ this, for
    // UNSTABLE_FRAMES frames) before the loop re-arms. This prevents the
    // "same motionless document re-captures forever" bug — intent of
    // auto-capture is ONE photo per placement, not continuous burst.
    const UNSTABLE_THRESHOLD = 12;
    const UNSTABLE_FRAMES = 6;

    const tick = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // Freeze auto-capture while native file picker is open or a capture is
      // already in flight. Manual shutter is not affected (it bypasses this
      // loop entirely).
      if (galleryOpenRef.current || captureLockRef.current) {
        prevFrameRef.current = null;
        stableCountRef.current = 0;
        unstableCountRef.current = 0;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, diff.width, diff.height);
      const imageData = ctx.getImageData(0, 0, diff.width, diff.height);
      const data = imageData.data;
      const prev = prevFrameRef.current;
      if (prev && prev.length === data.length) {
        let sum = 0;
        let samples = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += Math.abs((data[i] ?? 0) - (prev[i] ?? 0));
          samples++;
        }
        const avg = sum / Math.max(samples, 1);

        if (!armedRef.current) {
          // Disarmed state: watch for meaningful motion so we can re-arm.
          if (avg >= UNSTABLE_THRESHOLD) {
            unstableCountRef.current++;
            if (unstableCountRef.current >= UNSTABLE_FRAMES) {
              armedRef.current = true;
              unstableCountRef.current = 0;
              stableCountRef.current = 0;
            }
          } else {
            unstableCountRef.current = 0;
          }
        } else if (avg < STABLE_THRESHOLD) {
          stableCountRef.current++;
          if (stableCountRef.current >= STABLE_FRAMES) {
            armedRef.current = false;
            stableCountRef.current = 0;
            unstableCountRef.current = 0;
            void snapFromVideo();
          }
        } else {
          stableCountRef.current = 0;
        }
      }
      prevFrameRef.current = new Uint8ClampedArray(data);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      prevFrameRef.current = null;
    };
  }, [videoReady, snapFromVideo]);

  // ─── SW registration + online/offline wiring ───────────────────
  useEffect(() => {
    void registerInvoiceSW();
    // Drain on mount: pick up any pending IDB items from a previous session.
    if (navigator.onLine) void drainQueue();
    const onOnline = () => {
      setOnline(true);
      void drainQueue();
      // Notify other /erfassen tabs via the SW.
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "REQUEST_SYNC" });
      }
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const onMsg = (event: MessageEvent) => {
      if (event.data && event.data.type === "SYNC_CAPTURES") {
        void drainQueue();
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMsg);
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMsg);
      }
    };
  }, [drainQueue]);

  // ─── Gallery / file fallback handler ──────────────────────────
  const onGalleryChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      // File picker is closed once onChange fires (cancel also fires with
      // empty files) — resume auto-capture on the next frame and require
      // a fresh stable window before firing.
      galleryOpenRef.current = false;
      armedRef.current = false;
      if (!file) return;
      const mime = inferMime(file.name, file.type);
      const parsed = invoiceUploadInputSchema.safeParse({
        originalFilename: file.name,
        fileType: mime,
        sizeBytes: file.size,
      });
      if (!parsed.success) {
        setInlineError(
          parsed.error.issues[0]?.message ??
            "Ungültige Datei. Bitte überprüfe dein Dokument.",
        );
        return;
      }
      await submitBlob(file, file.name, mime);
    },
    [submitBlob],
  );

  const triggerFilePicker = () => {
    // Pause auto-capture BEFORE opening the native picker so no frames fire
    // while the modal is up.
    galleryOpenRef.current = true;
    fileInputRef.current?.click();
    // iOS Safari does not fire `change` on cancel, so also resume when the
    // window regains focus (fires on both select and cancel). `once: true`
    // ensures we don't double-handle the selected-file path.
    const resume = () => {
      galleryOpenRef.current = false;
      armedRef.current = false;
    };
    window.addEventListener("focus", resume, { once: true });
  };

  const retry = useCallback(async () => {
    await requeueFailed();
    await drainQueue();
  }, [drainQueue]);

  // ─── Render: fallback card (no camera) ─────────────────────────
  if (fallback) {
    const headline = "Kamera nicht verfügbar.";
    const body =
      fallback === "https"
        ? "Kamera benötigt eine sichere Verbindung (HTTPS)."
        : "Bitte erlaube den Kamerazugriff in den Browser-Einstellungen oder wähle eine Datei aus.";
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4">
        <Card>
          <CardHeader>
            <CardTitle>{headline}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">{body}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={onGalleryChange}
              className="hidden"
              aria-invalid={inlineError ? true : undefined}
            />
            <Button type="button" size="lg" onClick={triggerFilePicker}>
              <FolderOpen className="size-5" aria-hidden />
              Datei auswählen
            </Button>
            {inlineError ? (
              <p className="text-destructive mt-2 text-sm" role="alert">
                {inlineError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="link"
              onClick={() => router.push("/dashboard")}
            >
              Zurück zum Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render: viewfinder ────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-black">
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
      >
        Kamera aktiv. Rechnung vor die Kamera halten.
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="fixed inset-0 h-[100dvh] w-screen object-cover bg-black"
      />

      {!videoReady ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-16 animate-pulse rounded-full bg-white/10" />
        </div>
      ) : null}

      {/* Document-guide overlay (A4 aspect 1:√2) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          className="rounded-md border-2 border-dashed border-white/60"
          style={{ width: "70vmin", height: `calc(70vmin * 1.414)` }}
        />
      </div>

      {/* Top chrome: gallery + done */}
      <div
        className="absolute top-0 left-0 right-0 flex items-start justify-between p-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)" }}
      >
        <Button
          type="button"
          variant="secondary"
          onClick={triggerFilePicker}
          className="h-12 min-w-12 gap-2"
          aria-label="Galerie oder Datei auswählen"
        >
          <FolderOpen className="size-5" aria-hidden />
          Galerie / Datei
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={onGalleryChange}
          className="hidden"
          aria-invalid={inlineError ? true : undefined}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            router.push("/dashboard");
          }}
          className="h-12 min-w-12 gap-2"
          aria-label="Fertig — zurück zum Dashboard"
        >
          <Check className="size-5" aria-hidden />
          Fertig
        </Button>
      </div>

      {/* Counter badge */}
      {(uploadedCount > 0 || pendingCount > 0 || failedCount > 0) ? (
        <div
          key={pop}
          className="absolute left-1/2 top-20 -translate-x-1/2 animate-in zoom-in-75 duration-200"
        >
          <span className="inline-block whitespace-nowrap rounded-full bg-primary/90 px-4 py-2 text-xs sm:text-sm font-medium text-primary-foreground shadow-lg">
            {uploadedCount} erfasst
            {!online && pendingCount > 0
              ? ` · ${pendingCount} in Warteschlange`
              : null}
          </span>
        </div>
      ) : null}

      {/* Shutter */}
      <div
        className="absolute bottom-0 left-0 right-0 flex justify-center"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 2rem)" }}
      >
        <button
          type="button"
          onClick={() => void snapFromVideo()}
          className="size-14 rounded-full border-4 border-white bg-white/20 backdrop-blur transition active:scale-95"
          aria-label="Rechnung aufnehmen"
        >
          <Camera className="m-auto size-7 text-white" aria-hidden />
        </button>
      </div>

      {/* Inline failed banner */}
      {failedCount > 0 ? (
        <div className="absolute left-4 right-4 top-4 rounded-md bg-destructive/90 p-3 text-destructive-foreground text-sm flex items-center justify-between gap-2">
          <span>
            {failedCount} Aufnahme
            {failedCount === 1 ? "" : "n"} konnte
            {failedCount === 1 ? "" : "n"} nicht hochgeladen werden.
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void retry()}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : null}

      {/* Inline validation / compression errors */}
      {inlineError ? (
        <div className="absolute left-4 right-4 bottom-28 flex justify-center">
          <p
            role="alert"
            className="rounded-md bg-background/95 px-3 py-2 text-destructive mt-2 text-sm shadow"
          >
            {inlineError}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setInlineError(null)}
              aria-label="Meldung schließen"
              className="ml-2 size-6"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </p>
        </div>
      ) : null}
    </div>
  );
}
