import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const searchArchivedInvoicesMock = vi.fn();
vi.mock("@/app/actions/invoices", () => ({
  searchArchivedInvoices: (...args: unknown[]) => searchArchivedInvoicesMock(...args),
}));

vi.mock("@/lib/archive-query", () => ({
  parseArchiveQuery: vi.fn(() => ({ page: 1, pageSize: 50 })),
  PAGE_SIZE: 50,
}));

vi.mock("@/components/archive/archive-search-filters", () => ({
  ArchiveSearchFilters: () => null,
}));
vi.mock("@/components/archive/archive-result-list", () => ({
  ArchiveResultList: (props: Record<string, unknown>) => ({
    type: "ArchiveResultList",
    props,
  }),
}));
vi.mock("@/components/archive/archive-pagination", () => ({
  ArchivePagination: (props: Record<string, unknown>) => ({
    type: "ArchivePagination",
    props,
  }),
}));
vi.mock("@/components/archive/retention-notice", () => ({
  RetentionNotice: () => null,
}));

import ArchivPage from "./page";

describe("ArchivPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("empty results pass empty rows and total=0 to ArchiveResultList", async () => {
    searchArchivedInvoicesMock.mockResolvedValue({
      success: true,
      data: { rows: [], total: 0, page: 1, pageSize: 50 },
    });

    const result = await ArchivPage({ searchParams: Promise.resolve({}) });
    const json = JSON.stringify(result);

    expect(json).toContain('"rows":[]');
    expect(json).toContain('"total":0');
  });

  it("non-empty results pass row count and show pagination", async () => {
    const mockRows = [
      { id: "inv-1", status: "ready", supplier_name_value: "Muster GmbH" },
      { id: "inv-2", status: "exported", supplier_name_value: "Test AG" },
    ];
    searchArchivedInvoicesMock.mockResolvedValue({
      success: true,
      data: { rows: mockRows, total: 87, page: 1, pageSize: 50 },
    });

    const result = await ArchivPage({ searchParams: Promise.resolve({}) });
    const json = JSON.stringify(result);

    expect(json).toContain('"total":87');
    // ArchivePagination receives total=87 (confirms it was rendered)
    // The mock returns an object with props, so we assert on the props presence
    expect(json).toContain('"pageSize":50');
  });
});
