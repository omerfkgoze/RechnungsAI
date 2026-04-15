/**
 * AiDisclaimer — persistent visual reminder for AI-processed results.
 *
 * Mount ABOVE every AI-extracted result surface (FR49).
 * Do NOT gate by user consent — Story 1.4 already captured
 * `users.ai_disclaimer_accepted_at`; this is a persistent visual reminder.
 *
 * Usage:
 *   <AiDisclaimer />                        // default
 *   <AiDisclaimer className="mt-4" />      // with layout adjustment
 *
 * Epic 2 Story 2.2 will mount this above every <ConfidenceIndicator> cascade.
 */
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function AiDisclaimer({ className }: Props) {
  return (
    <div
      className={cn(
        "border-l-4 border-warning bg-warning/10 px-3 py-2 text-body-sm",
        className,
      )}
    >
      Die von der KI vorgeschlagenen Daten müssen überprüft werden. Die
      endgültige Verantwortung liegt beim Nutzer.
    </div>
  );
}
