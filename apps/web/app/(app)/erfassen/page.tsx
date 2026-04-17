import type { Metadata } from "next";
import { CameraCaptureShell } from "@/components/capture/camera-capture-shell";

export const metadata: Metadata = {
  title: "Rechnung erfassen – RechnungsAI",
};

export default function ErfassenPage() {
  return <CameraCaptureShell />;
}
