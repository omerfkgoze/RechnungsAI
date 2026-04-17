import { AlertTriangle, Check, X } from "lucide-react";
import { confidenceLevel, type ConfidenceLevel } from "@rechnungsai/shared";
import { cn } from "@/lib/utils";

type Variant = "dot" | "badge" | "bar";

type Props = {
  confidence: number;
  variant: Variant;
  fieldName: string;
  explanation: string | null;
  onTap?: () => void;
};

const LEVEL_LABEL_DE: Record<ConfidenceLevel, string> = {
  high: "hoch",
  medium: "mittel",
  low: "niedrig",
};

const LEVEL_COLOR: Record<ConfidenceLevel, string> = {
  high: "bg-confidence-high text-confidence-high",
  medium: "bg-confidence-medium text-confidence-medium",
  low: "bg-confidence-low text-confidence-low",
};

function levelIcon(level: ConfidenceLevel) {
  if (level === "high") return <Check aria-hidden className="h-3 w-3" />;
  if (level === "medium")
    return <AlertTriangle aria-hidden className="h-3 w-3" />;
  return <X aria-hidden className="h-3 w-3" />;
}

export function ConfidenceIndicator({
  confidence,
  variant,
  fieldName,
  explanation,
  onTap,
}: Props) {
  const level = confidenceLevel(confidence);
  const pct = Math.round(confidence * 100);
  const ariaLabel = `${fieldName}: Konfidenz ${pct}%, ${LEVEL_LABEL_DE[level]}`;
  const pulse = level !== "high" ? "animate-pulse" : "";

  const inner =
    variant === "dot" ? (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs",
          LEVEL_COLOR[level].split(" ")[1],
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full",
            LEVEL_COLOR[level].split(" ")[0],
            pulse,
          )}
        />
        {levelIcon(level)}
      </span>
    ) : variant === "badge" ? (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
          LEVEL_COLOR[level],
          "bg-opacity-20",
          pulse,
        )}
      >
        {levelIcon(level)}
        <span>{pct}%</span>
      </span>
    ) : (
      <span
        className="relative block h-1 w-full overflow-hidden rounded bg-muted"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className={cn(
            "absolute left-0 top-0 h-full",
            LEVEL_COLOR[level].split(" ")[0],
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
    );

  const common = (
    <>
      {inner}
      {level !== "high" && explanation ? (
        <span className="mt-1 block text-caption text-muted-foreground">
          {explanation}
        </span>
      ) : null}
    </>
  );

  // The bar variant carries aria-label on its inner role="progressbar" element;
  // the outer wrapper gets no duplicate label in that case.
  const outerAriaLabel = variant === "bar" ? undefined : ariaLabel;

  if (onTap) {
    return (
      <button
        type="button"
        onClick={onTap}
        aria-label={outerAriaLabel ?? ariaLabel}
        className="inline-flex flex-col items-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
      >
        {common}
      </button>
    );
  }
  return (
    <span
      className="inline-flex flex-col items-start"
      aria-label={outerAriaLabel}
    >
      {common}
    </span>
  );
}
