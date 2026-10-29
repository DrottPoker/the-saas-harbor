// The frame every email shares: the logo, a card with the content and small print below it. Email
// clients ignore stylesheets and many ignore flexbox, so it is tables with inline styles. The
// colors are the light theme's tokens from globals.css; the meta tags ask clients not to invert them.
import { DEFAULT_LOCALE, LOCALE_INFO, localizedPath, type Locale } from "@/i18n/config";

const latinFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial";
// Fonts for the scripts of the other languages, after the Latin ones so brand names keep those.
const scriptFonts: Record<Locale, string> = {
  en: "",
  es: "",
  ru: "",
  zh: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', ",
  hi: "'Kohinoor Devanagari', 'Nirmala UI', Mangal, 'Noto Sans Devanagari', ",
  ar: "'Geeza Pro', 'Noto Sans Arabic', Tahoma, ",
};
const emailFont = (locale: Locale) => `${latinFont}, ${scriptFonts[locale]}sans-serif`;

export const emailColors = {
  background: "#e8e6df",
  surface: "#f0eee9",
  border: "#cfccc3",
  foreground: "#1a1b1e",
  mutedForeground: "#4f5358",
  primary: "#1a1b1e",
  primaryForeground: "#f0eee9",
  accent: "#0d6561",
  logoInk: "#0b2a55",
};

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

/** A paragraph of HTML content. */
export const emailParagraph = (content: string, margin = "0 0 16px") =>
  `<p style="margin: ${margin}">${content}</p>`;

/** A link in the content, in the accent color. */
export const emailLink = (label: string, url: string) =>
  `<a href="${escapeHtml(url)}" style="color: ${emailColors.accent}; text-decoration: underline">${escapeHtml(label)}</a>`;

/** The main action. A table cell keeps the button's color in clients that drop link padding. */
export const emailButton = (label: string, url: string, locale: Locale = DEFAULT_LOCALE) =>
  [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 0">`,
    `<tr><td style="background: ${emailColors.primary}; border-radius: 8px">`,
    `<a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 20px; font-family: ${emailFont(locale)}; font-size: 15px; font-weight: 600; line-height: 1.2; color: ${emailColors.primaryForeground}; text-decoration: none; border-radius: 8px">${escapeHtml(label)}</a>`,
    `</td></tr>`,
    `</table>`,
  ].join("\n");

/**
 * A whole HTML email in a language. `origin` is the site's address without a trailing slash; the
 * auth templates pass a template variable instead. `preview` is the line inboxes show after the
 * subject. Heading and preview are text; content and footer are HTML.
 */
export function emailDocument({
  origin,
  locale = DEFAULT_LOCALE,
  heading,
  preview,
  content,
  footer,
}: {
  origin: string;
  locale?: Locale;
  heading: string;
  preview: string;
  content: string;
  footer: string[];
}) {
  const { lang, dir } = LOCALE_INFO[locale];
  const rtl = dir === "rtl";
  // Clients that keep only the body drop the attribute on <html>, so the outer table repeats it.
  const direction = rtl ? ` dir="rtl"` : "";
  // The logo leads to the home page in the email's language.
  const home = locale === DEFAULT_LOCALE ? origin : `${origin}${localizedPath(locale, "/")}`;
  const font = emailFont(locale);
  // Filler after the preview, so clients do not pad it with the start of the email.
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);
  return [
    `<!doctype html>`,
    `<html lang="${lang}"${direction}>`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta name="color-scheme" content="light">`,
    `<meta name="supported-color-schemes" content="light">`,
    `<title>${escapeHtml(heading)}</title>`,
    `</head>`,
    `<body style="margin: 0; padding: 0; background: ${emailColors.background}">`,
    `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0">${escapeHtml(preview)}${filler}</div>`,
    `<table role="presentation"${direction} width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${emailColors.background}">`,
    `<tr><td align="center" style="padding: 32px 12px">`,
    `<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; margin: 0 auto; font-family: ${font}">`,
    `<tr><td style="padding: 0 4px 20px">`,
    `<a href="${home}" style="color: ${emailColors.logoInk}; text-decoration: none">`,
    `<img src="${origin}/logo.png" width="36" height="36" alt="" style="display: inline-block; vertical-align: middle; border: 0">`,
    `<span style="display: inline-block; vertical-align: middle; ${rtl ? "padding-right" : "padding-left"}: 8px; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; color: ${emailColors.logoInk}">The SaaS Harbor</span>`,
    `</a>`,
    `</td></tr>`,
    `<tr><td style="background: ${emailColors.surface}; border: 1px solid ${emailColors.border}; border-radius: 12px; padding: 28px 24px; font-size: 15px; line-height: 1.6; color: ${emailColors.foreground}">`,
    `<h1 style="margin: 0 0 16px; font-size: 20px; line-height: 1.3; font-weight: 700; color: ${emailColors.foreground}">${escapeHtml(heading)}</h1>`,
    content,
    `</td></tr>`,
    `<tr><td style="padding: 20px 4px 0; font-size: 13px; line-height: 1.5; color: ${emailColors.mutedForeground}">`,
    ...footer.map((part, index) =>
      emailParagraph(part, index === footer.length - 1 ? "0" : "0 0 8px"),
    ),
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
    `</body>`,
    `</html>`,
  ].join("\n");
}
