// The Auth emails Supabase sends, in the same frame as the notification emails. They are Go
// templates: supabase/templates holds the output, which a unit test keeps in step with this file
// (`npx vitest run -u` rewrites it). The links open the app's confirm page, which verifies the token
// only when the reader presses its button, so they work in any browser and link scanners cannot use
// them up. RedirectTo is the app's /auth/confirm address, checked against the allowed redirect URLs.
import { emailButton, emailDocument, emailParagraph, escapeHtml } from "./layout";

const note = "{{/* Generated from src/lib/email/auth-templates.ts. Do not edit by hand. */}}";

function authTemplate({
  heading,
  preview,
  body,
  action,
  footer,
}: {
  heading: string;
  preview: string;
  body: string;
  action: { label: string; url: string };
  footer: string;
}) {
  const html = emailDocument({
    origin: "{{ .SiteURL }}",
    heading,
    preview,
    content: [emailParagraph(escapeHtml(body)), emailButton(action.label, action.url)].join("\n"),
    footer: [escapeHtml(footer)],
  });
  return `${note}\n${html}\n`;
}

export const authTemplates = {
  confirmation: authTemplate({
    heading: "Confirm your email",
    preview: "Confirm your email address to finish creating your account.",
    body: "Thanks for signing up for The SaaS Harbor. Confirm your email address to finish creating your account.",
    action: {
      label: "Confirm your email",
      url: "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email",
    },
    footer:
      "The link works once and expires after an hour, and you can open it on any device. If you did not sign up, ignore this email and no account is created.",
  }),
  recovery: authTemplate({
    heading: "Reset your password",
    preview: "Choose a new password for your account on The SaaS Harbor.",
    body: "Someone asked to reset the password for your account on The SaaS Harbor. Choose a new password with the button below.",
    action: {
      label: "Choose a new password",
      url: "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery",
    },
    footer:
      "The link works once and expires after an hour, and you can open it on any device. If you did not ask for this, ignore this email and your password stays the same.",
  }),
  // Sent to the current address and to the new one, each with its own link; the change is made
  // once both are confirmed.
  email_change: authTemplate({
    heading: "Confirm your new email address",
    preview: "Confirm the change of your email address on The SaaS Harbor.",
    body: "Someone asked to change the email address of your account on The SaaS Harbor from {{ .Email }} to {{ .NewEmail }}. The change is made once it is confirmed from both addresses.",
    action: {
      label: "Confirm the change",
      url: "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change",
    },
    footer:
      "The link works once and expires after an hour, and you can open it on any device. If you did not ask for this, ignore this email and your email address stays the same.",
  }),
};
