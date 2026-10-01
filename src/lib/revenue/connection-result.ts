import { isProviderId, type ProviderId } from "./catalog";

/**
 * The cookie that carries how connecting a payment provider went back to the product's editor for
 * a minute: after saving the product form with a key, and on the way back from an OAuth approval.
 * It holds a message written for the founder, never text from the address, which anyone could
 * craft.
 */
export const CONNECTION_RESULT_COOKIE = "harbor_connection_result";
export const CONNECTION_RESULT_SECONDS = 60;

export type ConnectionResult = {
  saasId: string;
  provider: ProviderId;
  tone: "success" | "error";
  text: string;
  /** When it was written, so the editor can tell one result from the next. */
  at: number;
};

export function encodeConnectionResult(result: ConnectionResult) {
  return Buffer.from(JSON.stringify(result)).toString("base64url");
}

export function decodeConnectionResult(value: string | undefined): ConnectionResult | null {
  if (!value) return null;
  try {
    const result = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ConnectionResult;
    return typeof result.saasId === "string" &&
      isProviderId(result.provider) &&
      (result.tone === "success" || result.tone === "error") &&
      typeof result.text === "string" &&
      Number.isFinite(result.at)
      ? result
      : null;
  } catch {
    return null;
  }
}

/** The product's editor, which shows the result at its revenue section. */
export function connectionResultPath(saasId: string) {
  return `/dashboard/saas/${saasId}?connection=1#revenue`;
}
