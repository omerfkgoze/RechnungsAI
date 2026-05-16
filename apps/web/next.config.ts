import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // @react-pdf/renderer must stay an external (non-bundled) server package:
  // bundling it through the App Router triggers a multi-React-reconciler
  // crash (spike P1, GitHub #3285). Node.js runtime only — never Edge.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default withSentryConfig(nextConfig, {
  // Source maps uploaded to Sentry for readable stack traces in production.
  silent: true,
  // Disable source map upload in local dev (no SENTRY_AUTH_TOKEN set).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Auto-instrumentation for Next.js App Router.
  webpack: { autoInstrumentServerFunctions: true },
});
