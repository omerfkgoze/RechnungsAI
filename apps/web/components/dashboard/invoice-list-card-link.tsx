"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  invoiceId: string;
  ariaLabel: string;
  className: string;
  children: React.ReactNode;
};

export function InvoiceListCardLink({ invoiceId, ariaLabel, className, children }: Props) {
  const router = useRouter();

  return (
    <Link
      href={`/rechnungen/${invoiceId}`}
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        // Read matchMedia at click time to avoid stale-ref on first render.
        if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
          e.preventDefault();
          router.replace(`?selected=${invoiceId}`, { scroll: false });
        }
      }}
    >
      {children}
    </Link>
  );
}
