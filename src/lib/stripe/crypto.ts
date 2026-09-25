import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { VerificationError } from "./errors";

// AES-256-GCM with the SaaS id as associated data, so a ciphertext only decrypts for the product
// it was stored for. Format: v1:<iv>:<ciphertext>:<tag>, base64url. The version prefix leaves
// room for key rotation.
const VERSION = "v1";

function encryptionKey(value = process.env.STRIPE_KEY_ENCRYPTION_KEY) {
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error("Stripe verification is not configured on this server.");
  return key;
}

export function encryptStripeKey(plaintext: string, saasId: string, secret?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(saasId));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, encrypted, cipher.getAuthTag()]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":");
}

export function decryptStripeKey(stored: string, saasId: string, secret?: string) {
  const [version, iv, encrypted, tag] = stored.split(":");
  if (version !== VERSION || !iv || !encrypted || !tag)
    throw new VerificationError("The stored Stripe key is not readable. Reconnect Stripe.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(saasId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new VerificationError("The stored Stripe key is not readable. Reconnect Stripe.");
  }
}
