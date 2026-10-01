// Whether a failure to send an email belongs to the service rather than to the email. Pure, so it
// is unit-tested; the outbox puts such an email back without counting an attempt.

// nodemailer's codes for a server that cannot be reached, answers wrongly or refuses the site's
// credentials, and the network's own.
const SERVICE_CODES = new Set([
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
  "ETLS",
  "EPROTOCOL",
  "EAUTH",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * True when the SMTP server could not be reached, refused the site's credentials or answered with
 * a temporary failure (4xx); false for an answer about this email, such as a refused recipient.
 */
export function serviceFailure(error: unknown) {
  const { code, responseCode } = parts(error);
  if (responseCode !== null && responseCode >= 400 && responseCode < 500) return true;
  return code !== null && SERVICE_CODES.has(code);
}

/** The code and SMTP reply code of a failure, for the log: never the message, which may hold an address. */
export function failureCode(error: unknown) {
  const { code, responseCode } = parts(error);
  return [code, responseCode].filter((part) => part !== null).join(" ") || "unknown";
}

function parts(error: unknown) {
  const { code, responseCode } = (error && typeof error === "object" ? error : {}) as {
    code?: unknown;
    responseCode?: unknown;
  };
  return {
    code: typeof code === "string" && /^[A-Z_]{2,32}$/.test(code) ? code : null,
    responseCode: typeof responseCode === "number" ? responseCode : null,
  };
}
