import "server-only";
import { adminClient } from "../supabase/admin";
import { CaptureError, openCamera, type Camera } from "./capture";

// The scheduled screenshot run (migration 20260926110000): it claims the products that are due one
// at a time, takes each screenshot, stores it in the founder's folder and records it, and deletes
// the files that screenshots replaced. Only this trusted server code writes screenshots.

const BUCKET = "profile-images";
const GENERIC_FAILURE = "The page could not be captured.";

async function removeFiles(paths: string[]) {
  if (!paths.length) return;
  const { error } = await adminClient().storage.from(BUCKET).remove(paths);
  if (error) console.error("Replaced screenshots could not be deleted:", error.message);
}

/**
 * Takes the screenshots that are due until none is left or `budgetMs` has passed. With `saasId`,
 * only that product, if it is due. The browser starts only when there is something to take.
 */
export async function captureDueScreenshots({
  budgetMs = 90_000,
  saasId,
}: { budgetMs?: number; saasId?: string } = {}) {
  const started = Date.now();
  const admin = adminClient();
  const { data: stale, error: staleError } = await admin.rpc("take_stale_screenshots", {
    p_limit: 100,
  });
  if (staleError) throw new Error("Replaced screenshots could not be listed.");
  await removeFiles(stale);

  let camera: Camera | null = null;
  let taken = 0;
  let failed = 0;
  try {
    while (Date.now() - started < budgetMs) {
      const { data, error } = await admin.rpc("claim_due_screenshots", {
        p_limit: 1,
        ...(saasId && { p_saas: saasId }),
      });
      if (error) throw new Error("Due screenshots could not be claimed.");
      const due = data[0];
      if (!due) break;
      let path: string | null = null;
      let failure: string | null = null;
      let broken: unknown = null;
      try {
        try {
          camera ??= await openCamera();
        } catch (cause) {
          // Without a browser, nothing else can be taken either.
          broken = cause;
          throw cause;
        }
        const bytes = await camera.capture(due.website);
        const file = `${due.owner_id}/screenshot-${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await admin.storage.from(BUCKET).upload(file, bytes, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });
        if (uploadError)
          throw new Error(`The screenshot could not be stored: ${uploadError.message}`);
        path = file;
      } catch (cause) {
        failure = cause instanceof CaptureError ? cause.message : GENERIC_FAILURE;
        if (!(cause instanceof CaptureError)) console.error("A screenshot failed:", cause);
      }
      const { data: unused, error: recordError } = await admin.rpc("record_screenshot", {
        p_saas: due.saas_id,
        p_website: due.website,
        p_path: path,
        p_error: failure,
      });
      if (recordError) {
        console.error("A screenshot could not be recorded:", recordError.message);
        if (path) await removeFiles([path]);
        failed++;
      } else {
        await removeFiles(unused);
        if (path && !unused.includes(path)) taken++;
        else failed++;
      }
      if (broken) throw broken;
    }
  } finally {
    await camera?.close();
  }
  return { taken, failed };
}
