import {
  PIPELINE_STAGES,
  type PipelineStage,
  type InvoiceStatus,
} from "@/lib/status-labels";
import { PipelineHeaderStages } from "./pipeline-header-stages";

// Aggregates Supabase stage counts into the 4 pipeline buckets — `review`
// folds into `ready` ("Bereit") per Story 3.1 AC #1.
export function aggregateStageCounts(
  rows: ReadonlyArray<{ status: InvoiceStatus; count: number | bigint }>,
): Record<PipelineStage, number> {
  const acc: Record<PipelineStage, number> = {
    captured: 0,
    processing: 0,
    ready: 0,
    exported: 0,
  };
  for (const r of rows) {
    const n = typeof r.count === "bigint" ? Number(r.count) : r.count;
    if (r.status === "review") acc.ready += n;
    else if (r.status in acc) acc[r.status as PipelineStage] += n;
    else if (n > 0) {
      // Guard against DB enum drift: a new status value that the client
      // doesn't know about would otherwise silently disappear from counts.
      console.warn(
        "[pipeline-header] unmapped invoice status — counts will be short",
        { status: r.status, count: n },
      );
    }
  }
  return acc;
}

type Props = {
  stageCounts: Record<PipelineStage, number>;
  activeStage: PipelineStage | null;
};

export function PipelineHeader({ stageCounts, activeStage }: Props) {
  const allZero = PIPELINE_STAGES.every((s) => stageCounts[s] === 0);
  return (
    <nav
      role="navigation"
      aria-label="Rechnungs-Pipeline"
      className="rounded-xl bg-card p-3 ring-1 ring-foreground/10"
    >
      <PipelineHeaderStages
        stageCounts={stageCounts}
        activeStage={activeStage}
        allZero={allZero}
      />
    </nav>
  );
}
