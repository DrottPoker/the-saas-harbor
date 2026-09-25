"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";
import { adminSession, safeAdminPath } from "@/lib/admin";
import { decisionSchema, noteSchema, type ActionState } from "@/lib/domain";
import { sendQueuedEmails } from "@/lib/email/outbox";

const id = z.uuid();
const denied: ActionState = { error: "Only admins can do this." };

function failure(error: PostgrestError): ActionState {
  // P0001 errors are written for admins by the decision functions.
  return {
    error:
      error.code === "P0001" ? `${error.message}.` : "The decision could not be saved. Try again.",
  };
}

// Every decision returns to the page it was made on, with a confirmation. The maker's and the
// reporters' emails go out right after the response.
function done(returnTo: string, result: string): never {
  sendQueuedEmails();
  revalidatePath("/", "layout");
  redirect(`${returnTo}?done=${result}`);
}

function decision(form: FormData) {
  return decisionSchema.safeParse({
    reason: String(form.get("reason") ?? ""),
    note: String(form.get("note") ?? ""),
  });
}

export async function hideSaasAction(
  saasId: string,
  reportId: string | null,
  returnTo: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await adminSession();
  const back = safeAdminPath(returnTo);
  if (!session || !back || !id.safeParse(saasId).success) return denied;
  if (reportId !== null && !id.safeParse(reportId).success) return denied;
  const parsed = decision(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { error } = await session.client.rpc("admin_hide_saas", {
    p_saas: saasId,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note,
    p_report: reportId,
  });
  if (error) return failure(error);
  done(back, "hidden");
}

export async function suspendAccountAction(
  profileId: string,
  reportId: string | null,
  returnTo: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await adminSession();
  const back = safeAdminPath(returnTo);
  if (!session || !back || !id.safeParse(profileId).success) return denied;
  if (reportId !== null && !id.safeParse(reportId).success) return denied;
  const parsed = decision(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { error } = await session.client.rpc("admin_suspend_account", {
    p_profile: profileId,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note,
    p_report: reportId,
  });
  if (error) return failure(error);
  done(back, "suspended");
}

export async function restoreSaasAction(
  saasId: string,
  returnTo: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await adminSession();
  const back = safeAdminPath(returnTo);
  if (!session || !back || !id.safeParse(saasId).success) return denied;
  const note = noteSchema.safeParse(String(form.get("note") ?? ""));
  if (!note.success) return { error: note.error.issues[0]?.message };
  const { error } = await session.client.rpc("admin_restore_saas", {
    p_saas: saasId,
    p_note: note.data,
  });
  if (error) return failure(error);
  done(back, "shown");
}

export async function restoreAccountAction(
  profileId: string,
  returnTo: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await adminSession();
  const back = safeAdminPath(returnTo);
  if (!session || !back || !id.safeParse(profileId).success) return denied;
  const note = noteSchema.safeParse(String(form.get("note") ?? ""));
  if (!note.success) return { error: note.error.issues[0]?.message };
  const { error } = await session.client.rpc("admin_restore_account", {
    p_profile: profileId,
    p_note: note.data,
  });
  if (error) return failure(error);
  done(back, "lifted");
}

export async function dismissReportAction(
  reportId: string,
  returnTo: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await adminSession();
  const back = safeAdminPath(returnTo);
  if (!session || !back || !id.safeParse(reportId).success) return denied;
  const note = noteSchema.safeParse(String(form.get("note") ?? ""));
  if (!note.success) return { error: note.error.issues[0]?.message };
  const { error } = await session.client.rpc("admin_dismiss_report", {
    p_report: reportId,
    p_note: note.data,
  });
  if (error) return failure(error);
  done(back, "dismissed");
}
