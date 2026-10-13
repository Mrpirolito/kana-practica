// Server instrumentation (Sentry, PostHog) is disabled in this private deployment.
declare global {
  var __posthogServer: import('posthog-node').PostHog | undefined;
}

export async function register(): Promise<void> {}
