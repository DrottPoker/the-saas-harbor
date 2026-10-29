// Reads the migrations for what the database says to users, so the pages can be checked against it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const directory = join(__dirname, "../../../supabase/migrations");

/**
 * The errors a database function raises for users (P0001, the default), from the newest migration
 * that defines it, without the full stop the actions add.
 */
export function userErrorsOf(name: string): string[] {
  const header = new RegExp(`create (?:or replace )?function public\\.${name}\\(`, "i");
  const file = readdirSync(directory)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .reverse()
    .map((entry) => readFileSync(join(directory, entry), "utf8"))
    .find((sql) => header.test(sql));
  if (!file) throw new Error(`No migration defines public.${name}.`);
  const start = file.search(header);
  const next = file.slice(start + 1).search(/create (?:or replace )?function /i);
  const body = next === -1 ? file.slice(start) : file.slice(start, start + 1 + next);
  return [
    ...body.matchAll(/raise exception '((?:[^']|'')*)'(?:\s+using errcode\s*=\s*'([^']+)')?/gi),
  ]
    .filter((match) => !match[2] || match[2] === "P0001")
    .map((match) => match[1].replaceAll("''", "'"));
}
