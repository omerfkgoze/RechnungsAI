import { cn } from "@/lib/utils";

type Step = "trust" | "setup" | "first-invoice";

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "trust", label: "1 Vertrauen" },
  { key: "setup", label: "2 Unternehmen" },
  { key: "first-invoice", label: "3 Erste Rechnung" },
];

export function OnboardingStepper({ current }: { current: Step }) {
  return (
    <ol
      role="list"
      aria-label="Onboarding Fortschritt"
      className="mb-6 flex items-center justify-center gap-2"
    >
      {STEPS.map((step) => {
        const isActive = step.key === current;
        return (
          <li
            key={step.key}
            role="listitem"
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-body-sm",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
