"use client";

import { useEffect, useRef } from "react";
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
  const isLgRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    isLgRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      isLgRef.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <Link
      href={`/rechnungen/${invoiceId}`}
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (isLgRef.current) {
          e.preventDefault();
          router.replace(`?selected=${invoiceId}`, { scroll: false });
        }
      }}
    >
      {children}
    </Link>
  );
}
