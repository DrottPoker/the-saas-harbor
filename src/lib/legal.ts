// The operator named in the privacy policy and the terms: the party responsible for personal data
// and for the service. `email` is the contact address for privacy requests, reports from people
// without an account, and appeals; while it is null, the pages say one will be published.
export const operator: { name: string; email: string | null } = {
  name: "The SaaS Harbor Team",
  email: null,
};

// Dates of the current versions, as YYYY-MM-DD. The terms' date is also their version: sign-up
// records it for each new account (private.terms_acceptances).
export const privacyUpdated = "2026-09-25";
export const termsUpdated = "2026-09-25";

/** A version date as the pages show it, such as September 25, 2026. */
export function legalDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}
