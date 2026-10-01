/**
 * A verification failure explained in words meant for the maker. Any other error reaches them as
 * a generic failure, so database and internal details never appear on the page.
 */
export class VerificationError extends Error {}

/** A run that read a key the founder has replaced since; what it read is not stored. */
export const REPLACED_DURING_CHECK =
  "The key was replaced during the check, so this result was not stored.";

/** A run whose provider the founder has disconnected since; what it read is not stored. */
export const DISCONNECTED_DURING_CHECK =
  "The provider was disconnected during the check, so this result was not stored.";

/**
 * A write the database refused because the founder replaced the key or disconnected the provider
 * while the check ran, as words for the maker; null for any other failure.
 */
export function changedDuringCheck(message: string | undefined) {
  if (message?.includes("connection changed")) return new VerificationError(REPLACED_DURING_CHECK);
  if (message?.includes("not connected to this provider"))
    return new VerificationError(DISCONNECTED_DURING_CHECK);
  return null;
}

/** The words a maker sees for a failure: its own message when it has one written for them. */
export function makerMessage(error: unknown) {
  if (error instanceof VerificationError) return error.message;
  console.error("Revenue verification failed:", error instanceof Error ? error.message : error);
  return "Verification failed. Try again shortly.";
}
