// @sparticuz/chromium is an optional dependency, installed only where it can run (Node.js 22.17 or
// later, as on Vercel and in CI), so the part of it the app uses is declared here for every machine.
declare module "@sparticuz/chromium" {
  const chromium: {
    /** Arguments Chromium needs in a serverless function. */
    args: string[];
    /** Unpacks the bundled Chromium, once per instance, and returns where it is. */
    executablePath(input?: string): Promise<string>;
  };
  export default chromium;
}
