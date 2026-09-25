import "server-only";
import { after } from "next/server";
import nodemailer from "nodemailer";
import { operator } from "../legal";
import { siteUrl } from "../seo";
import { adminClient } from "../supabase/admin";
import { renderEmail } from "./templates";

// claim_emails locks an email for two minutes. A run claims nothing new after one minute, and each
// SMTP step gives up after 15 seconds, so an email is not claimed again while it is being sent.
const RUN_MS = 60_000;
const SMTP_TIMEOUT_MS = 15_000;

// SMTP from the environment, so any email provider works. Without it nothing is sent, and queued
// emails wait.
function smtp() {
  const host = process.env.SMTP_HOST;
  const from = process.env.EMAIL_FROM;
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      // A remote server must switch to TLS before the password is sent. Local Mailpit has no TLS.
      requireTLS: !["127.0.0.1", "localhost", "::1"].includes(host),
      // One connection for the whole run.
      pool: true,
      maxConnections: 1,
      dnsTimeout: SMTP_TIMEOUT_MS,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
    }),
  };
}

// How long a message email waits for the recipient to read the message first.
function messageDelay() {
  const seconds = Math.round(Number(process.env.MESSAGE_EMAIL_DELAY_SECONDS || 300));
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), 86_400) : 300;
}

/**
 * Sends the notification emails that are due, claiming one at a time, so an email stays locked
 * only while it is being sent. The database queues them and decides what is due; this trusted
 * worker reads addresses with the service role, which nothing a maker controls can reach.
 * Addresses and message text are never logged.
 */
export async function deliverEmails(limit = 25) {
  const result = { configured: false, sent: 0, skipped: 0, failed: 0 };
  const mail = smtp();
  if (!mail) return result;
  result.configured = true;
  const admin = adminClient();
  const delay = messageDelay();
  const stop = Date.now() + RUN_MS;
  try {
    for (let done = 0; done < limit && Date.now() < stop; done++) {
      const { data, error } = await admin.rpc("claim_emails", {
        p_limit: 1,
        p_message_delay: delay,
      });
      if (error) throw new Error("Queued emails could not be read.");
      const row = data[0];
      if (!row) break;
      const email = renderEmail(row, { origin: siteUrl(), contact: operator?.email ?? null });
      let status: "sent" | "skipped" | "failed" = "skipped";
      let problem: string | null = "Nothing to send any more";
      if (email) {
        try {
          await mail.transport.sendMail({ from: mail.from, to: row.email, ...email });
          [status, problem] = ["sent", null];
        } catch (cause) {
          [status, problem] = ["failed", cause instanceof Error ? cause.message : "Sending failed"];
        }
      }
      const { error: completeError } = await admin.rpc("complete_email", {
        p_id: row.id,
        p_status: status,
        p_error: problem,
      });
      if (completeError) throw new Error("A sent email could not be recorded.");
      result[status]++;
    }
  } finally {
    mail.transport.close();
  }
  return result;
}

/** After the response, sends what an action just queued, such as a decision email. */
export function sendQueuedEmails() {
  after(async () => {
    try {
      await deliverEmails();
    } catch {
      console.error("Notification emails could not be sent. They stay queued.");
    }
  });
}
