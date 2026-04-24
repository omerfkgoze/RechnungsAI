"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DashboardEscHandler() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        router.replace("/dashboard", { scroll: false });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
