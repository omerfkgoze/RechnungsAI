import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Capture 10% of sessions as replays in production, 100% on errors.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  // Disable in development to keep the console clean.
  enabled: process.env.NODE_ENV === "production",
});
