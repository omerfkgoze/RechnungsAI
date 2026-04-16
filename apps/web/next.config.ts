import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withSentryConfig(nextConfig, {
  // Source maps uploaded to Sentry for readable stack traces in production.
  silent: true,
  // Disable source map upload in local dev (no SENTRY_AUTH_TOKEN set).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Auto-instrumentation for Next.js App Router.
  autoInstrumentServerFunctions: true,
});
