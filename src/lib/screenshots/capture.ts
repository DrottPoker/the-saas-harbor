import "server-only";
import { chromium, errors, type Browser } from "playwright-core";
import { imageInfo, MAX_IMAGE_SIDE } from "../image-format";
import { siteUrl } from "../seo";
import { startGuardProxy } from "./proxy";

// Screenshots of founders' landing pages, taken with headless Chromium: Playwright's own browser
// locally and in the tests, and @sparticuz/chromium on Vercel, where no browser is installed. All
// traffic goes through the guard proxy, which reaches public addresses only.

export const SCREENSHOT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
/** Taller pages are cut here; stored images keep to the app's image limits. */
const MAX_HEIGHT = MAX_IMAGE_SIDE;
/** profile-images takes files up to 2 MB. */
const MAX_BYTES = 2 * 1024 * 1024;
const NAVIGATION_TIMEOUT_MS = 25_000;

/** A failure the founder sees, such as a site that does not answer. */
export class CaptureError extends Error {}

/** Private addresses are allowed only for the browser tests' local site, never in production. */
function allowPrivateAddresses() {
  return process.env.SCREENSHOT_ALLOW_PRIVATE === "true" && process.env.NODE_ENV !== "production";
}

export type Camera = {
  capture: (url: string) => Promise<Uint8Array>;
  close: () => Promise<void>;
};

/** Starts the browser and the proxy, for one run of any number of screenshots. */
export async function openCamera(): Promise<Camera> {
  const proxy = await startGuardProxy({ allowPrivate: allowPrivateAddresses() });
  // Everything through the proxy, loopback included; WebRTC could otherwise send UDP around it.
  const args = [
    `--proxy-server=${proxy.url}`,
    "--proxy-bypass-list=<-loopback>",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--webrtc-ip-handling-policy=disable_non_proxied_udp",
  ];
  let browser: Browser;
  try {
    if (process.env.VERCEL) {
      // Installed only where it can run: see optionalDependencies in package.json.
      const { default: serverless } = await import("@sparticuz/chromium");
      browser = await chromium.launch({
        executablePath: await serverless.executablePath(),
        args: [...serverless.args, ...args],
        headless: true,
      });
    } else browser = await chromium.launch({ args, headless: true });
  } catch (cause) {
    await proxy.close();
    throw cause;
  }
  const major = browser.version().split(".")[0];
  const userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 TheSaaSHarbor/1.0 (+${siteUrl()}/about)`;

  const capture = async (url: string) => {
    const context = await browser.newContext({
      viewport: { width: SCREENSHOT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1,
      userAgent,
      locale: "en-US",
      colorScheme: "light",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
      const response = await page.goto(url, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
      if (!response) throw new CaptureError("The site sent no page.");
      if (response.status() >= 400)
        throw new CaptureError(`The site answered with HTTP ${response.status()}.`);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      // Images that load as they scroll into view load while the page is scrolled through once.
      await page.evaluate(async (limit) => {
        const bottom = Math.min(document.documentElement.scrollHeight, limit);
        for (let y = 0; y < bottom; y += window.innerHeight / 2) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        window.scrollTo(0, 0);
      }, MAX_HEIGHT);
      await page.waitForTimeout(700);
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const shoot = (height: number, quality: number) =>
        page.screenshot({
          type: "jpeg",
          quality,
          fullPage: true,
          animations: "disabled",
          clip: { x: 0, y: 0, width: SCREENSHOT_WIDTH, height },
        });
      let height = Math.max(VIEWPORT_HEIGHT, Math.min(pageHeight, MAX_HEIGHT));
      let bytes = await shoot(height, 75);
      // A busy page can exceed the size limit: less quality first, then less of the page.
      if (bytes.length > MAX_BYTES) bytes = await shoot(height, 55);
      while (bytes.length > MAX_BYTES && height > VIEWPORT_HEIGHT) {
        height = Math.max(VIEWPORT_HEIGHT, Math.floor(height / 2));
        bytes = await shoot(height, 55);
      }
      const image = imageInfo(new Uint8Array(bytes));
      if (bytes.length > MAX_BYTES || image?.type !== "image/jpeg")
        throw new CaptureError("The page was too large to capture.");
      return new Uint8Array(bytes);
    } catch (cause) {
      throw captureError(cause);
    } finally {
      await context.close().catch(() => {});
    }
  };

  return {
    capture,
    close: async () => {
      await browser.close().catch(() => {});
      await proxy.close();
    },
  };
}

// Browser errors in words a founder can act on. Anything unexpected keeps its cause for the log.
function captureError(cause: unknown) {
  if (cause instanceof CaptureError) return cause;
  if (cause instanceof errors.TimeoutError)
    return new CaptureError("The site did not finish loading within 25 seconds.");
  const message = cause instanceof Error ? cause.message : "";
  if (message.includes("ERR_NAME_NOT_RESOLVED"))
    return new CaptureError("The site's address could not be found.");
  if (
    /ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_REFUSED|CONNECTION_RESET|ADDRESS_UNREACHABLE)/.test(
      message,
    )
  )
    return new CaptureError("The site could not be reached.");
  if (/ERR_(CERT|SSL)_/.test(message))
    return new CaptureError("The site's security certificate is not valid.");
  return new Error("The page could not be captured.", { cause });
}
