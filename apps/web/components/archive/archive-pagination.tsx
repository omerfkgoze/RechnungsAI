"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type ArchivePaginationProps = {
  total: number;
  page: number;
  pageSize: number;
};

export function ArchivePagination({ total, page, pageSize }: ArchivePaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.ceil(total / pageSize);

  const navigate = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: true });
    },
    [router, pathname, searchParams],
  );

  if (total === 0 || totalPages <= 1) return null;

  return (
    <nav
      aria-label="Archiv-Paginierung"
      className="flex items-center justify-between gap-2 py-2"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => navigate(page - 1)}
        className="rounded-md border px-3 py-1 text-body-sm disabled:opacity-40"
      >
        Zurück
      </button>
      <span className="text-body-sm text-muted-foreground">
        Seite {page} von {totalPages} ({total} Einträge)
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => navigate(page + 1)}
        className="rounded-md border px-3 py-1 text-body-sm disabled:opacity-40"
      >
        Weiter
      </button>
    </nav>
  );
}
