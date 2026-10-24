/**
 * Sentry error monitoring disclosure logic.
 * 
 * The privacy policy should only mention Sentry as a processor when Sentry
 * is actually installed and configured. This helper determines whether to show
 * the Sentry-specific disclosure based on environment configuration.
 */

/**
 * Check if Sentry error monitoring is configured.
 * 
 * Returns true when NEXT_PUBLIC_SENTRY_DSN is set, indicating that Sentry
 * is actively collecting error reports.
 */
export function isSentryEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/**
 * Get the appropriate error monitoring disclosure text.
 * 
 * When Sentry is enabled, returns details about Sentry as the processor.
 * Otherwise, returns a generic statement about error logging.
 */
export function getErrorMonitoringDisclosure() {
  if (isSentryEnabled()) {
    return {
      enabled: true,
      processorName: "Sentry",
      description: "For error monitoring and diagnostics. Error reports are sent to Sentry with personally identifiable information scrubbed. Sentry's privacy policy applies to this data.",
    };
  }
  
  return {
    enabled: false,
    processorName: null,
    description: "Error logs may be collected for diagnostics and troubleshooting, with personally identifiable information excluded.",
  };
}
