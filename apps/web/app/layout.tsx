import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../public/fonts/Inter-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Inter-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/Inter-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/Inter-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: "RechnungsAI",
  description:
    "Rechnungen blitzschnell archivieren — GoBD-sicher, DSGVO-konform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
