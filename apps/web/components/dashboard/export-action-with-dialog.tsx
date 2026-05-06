"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExportAction } from "@/components/dashboard/export-action";
import { DatevExportDialog } from "@/components/export/datev-export-dialog";

type Props = {
  readyCount: number;
  exportedThisMonthCount?: number;
  tenantBeraterNr: string | null;
  tenantMandantenNr: string | null;
  tenantCompanyName: string;
};

export function ExportActionWithDialog({
  readyCount,
  exportedThisMonthCount,
  tenantBeraterNr,
  tenantMandantenNr,
  tenantCompanyName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <>
      <ExportAction
        readyCount={readyCount}
        exportedThisMonthCount={exportedThisMonthCount}
        onExport={() => setOpen(true)}
      />
      <DatevExportDialog
        open={open}
        onOpenChange={(next, didSucceed) => {
          setOpen(next);
          if (!next && didSucceed) {
            router.refresh();
          }
        }}
        readyCount={readyCount}
        tenantBeraterNr={tenantBeraterNr}
        tenantMandantenNr={tenantMandantenNr}
        tenantCompanyName={tenantCompanyName}
      />
    </>
  );
}
