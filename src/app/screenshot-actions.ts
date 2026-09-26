"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/domain";
import { requireUser } from "@/lib/supabase/server";

/** The founder asks for a new screenshot, which the next scheduled run takes. */
export async function requestScreenshotAction(saasId: string): Promise<ActionState> {
  const { client } = await requireUser();
  if (!z.uuid().safeParse(saasId).success)
    return { error: "You can only take a screenshot of your own SaaS." };
  // The database checks ownership, the setting and how recently one was taken or asked for.
  const { error } = await client.rpc("request_screenshot", { p_saas: saasId });
  if (error)
    return {
      error:
        error.code === "P0001"
          ? `${error.message}.`
          : "The screenshot could not be asked for. Please try again.",
    };
  revalidatePath(`/dashboard/saas/${saasId}`);
  return { success: "A new screenshot is taken within a few minutes." };
}
