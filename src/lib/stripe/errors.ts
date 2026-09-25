/**
 * A verification failure explained in words meant for the maker. Any other error reaches them as
 * a generic failure, so database and internal details never appear on the page.
 */
export class VerificationError extends Error {}

/** The words a maker sees for a failure: its own message when it has one written for them. */
export function makerMessage(error: unknown) {
  if (error instanceof VerificationError) return error.message;
  console.error("Stripe verification failed:", error instanceof Error ? error.message : error);
  return "Verification failed. Try again shortly.";
}
