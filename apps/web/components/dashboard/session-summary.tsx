"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FIRST_SESSION_KEY = "rai_session_seen";

type Variant =
  | "Perfect"
  | "WithCorrections"
  | "FirstSession"
  | "StreakMilestone"
  | "ExportPrompt";

type Props = {
  reviewCount: number;
  readyCount: number;
  invoiceCount: number;
  errorCount: number;
  streakWeeks: number;
  sessionStartMs: number;
};

function pickVariant({
  reviewCount,
  readyCount,
  errorCount,
  streakWeeks,
  isFirstSession,
}: {
  reviewCount: number;
  readyCount: number;
  errorCount: number;
  streakWeeks: number;
  isFirstSession: boolean;
}): Variant | null {
  if (reviewCount !== 0) return null;
  if (isFirstSession) return "FirstSession";
  if (streakWeeks > 0 && streakWeeks % 4 === 0) return "StreakMilestone";
  if (readyCount >= 10) return "ExportPrompt";
  if (errorCount > 0) return "WithCorrections";
  return "Perfect";
}

export function SessionSummary({
  reviewCount,
  readyCount,
  invoiceCount,
  errorCount,
  streakWeeks,
  sessionStartMs,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);
  const prevReviewRef = useRef<number | null>(null);
  const isFirstSessionRef = useRef<boolean>(false);

  useEffect(() => {
    isFirstSessionRef.current =
      typeof window !== "undefined" &&
      window.sessionStorage?.getItem(FIRST_SESSION_KEY) === null;
  }, []);

  useEffect(() => {
    if (prevReviewRef.current === null) {
      prevReviewRef.current = reviewCount;
      return;
    }
    if (prevReviewRef.current > 0 && reviewCount === 0) {
      setShow(true);
    }
    prevReviewRef.current = reviewCount;
  }, [reviewCount]);

  if (!show || dismissed) return null;

  const variant = pickVariant({
    reviewCount,
    readyCount,
    errorCount,
    streakWeeks,
    isFirstSession: isFirstSessionRef.current,
  });
  if (!variant) return null;

  const minutesSaved = invoiceCount * 12;
  const sessionSeconds = Math.max(
    0,
    Math.floor((Date.now() - sessionStartMs) / 1000),
  );

  const titles: Record<Variant, string> = {
    Perfect: "Perfekte Session ✨",
    WithCorrections: "Session abgeschlossen",
    FirstSession: "Willkommen — erste Session abgeschlossen",
    StreakMilestone: `${streakWeeks}-Wochen-Streak erreicht 🎯`,
    ExportPrompt: "Bereit für den DATEV-Export",
  };

  function onDismiss() {
    setDismissed(true);
    try {
      window.sessionStorage?.setItem(FIRST_SESSION_KEY, "1");
    } catch {
      // Best-effort — storage may be disabled in private mode
    }
  }

  return (
    <Card data-testid="session-summary" data-variant={variant}>
      <CardHeader>
        <CardTitle>{titles[variant]}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 text-body-sm">
          <div>
            <span className="text-muted-foreground">Verarbeitet: </span>
            <span className="font-medium">{invoiceCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Dauer: </span>
            <span className="font-medium tabular-nums">
              {Math.floor(sessionSeconds / 60)}m {sessionSeconds % 60}s
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Geschätzte Ersparnis: </span>
            <span className="font-medium">~{minutesSaved} Min.</span>
          </div>
          <div>
            <span className="text-muted-foreground">Korrekturen: </span>
            <span className="font-medium">{errorCount}</span>
          </div>
          {variant === "ExportPrompt" ? (
            <div className="col-span-2">
              <span className="text-muted-foreground">Bereit zum Export: </span>
              <span className="font-medium">{readyCount}</span>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            data-testid="session-summary-dismiss"
          >
            Schließen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
