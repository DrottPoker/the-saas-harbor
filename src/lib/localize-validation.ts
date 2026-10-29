import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { issuedMessage } from "./validation";

/**
 * A validation message in the request's language, for an action to return to a form: a zod
 * error's first issue, or a message a check returned (`invalid` in ./validation). Any other text is
 * returned as it is; an issue without a message of ours reads as a request to check the form.
 */
export async function localizeValidation(problem: z.ZodError | string): Promise<string> {
  const t = await getTranslations("validation");
  const text = typeof problem === "string" ? problem : problem.issues[0]?.message;
  const found = text ? issuedMessage(text) : null;
  if (found) return (t as (key: string, values?: object) => string)(found.key, found.values);
  return typeof problem === "string" ? problem : t("form.checkFields");
}

/** What an action returns for a failure it caught: a validation problem or an error's own words. */
export async function failureMessage(error: unknown): Promise<string> {
  if (error instanceof z.ZodError) return localizeValidation(error);
  if (error instanceof Error) return localizeValidation(error.message);
  return (await getTranslations("validation"))("form.failed");
}
