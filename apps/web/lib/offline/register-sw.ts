"use client";

export async function registerInvoiceSW(): Promise<
  ServiceWorkerRegistration | null
> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/erfassen",
    });
    return reg;
  } catch (err) {
    console.error("[invoices:sw]", err);
    return null;
  }
}
