// Validation messages: schemas and checks hand them out in English, which is what their errors
// carry (and what tests compare), and the server gives them to the browser in the request's
// language (`localizeValidation` in ./localize-validation). Shared by the browser and the server.
import { createTranslator } from "next-intl";
import messages from "@/messages/en/validation.json";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** A message's key in the validation namespace, such as product.category. */
export type ValidationKey = Leaves<typeof messages>;
/** A message's arguments. They come from the code, never from input, so the registry stays small. */
export type ValidationValues = Record<string, string | number>;
export type IssuedMessage = { key: ValidationKey; values?: ValidationValues };

const english = createTranslator({
  locale: "en",
  messages: { validation: messages },
  namespace: "validation",
  timeZone: "UTC",
});

// Every message handed out, by its English text. Next.js may load this module more than once in a
// process (once per bundle layer), so the copies share one registry.
const REGISTRY = Symbol.for("thesaasharbor.validation");
const issued: Map<string, IssuedMessage> = ((
  globalThis as { [REGISTRY]?: Map<string, IssuedMessage> }
)[REGISTRY] ??= new Map());

/** A validation message in English, as a schema or a check returns it. */
export function invalid(key: ValidationKey, values?: ValidationValues): string {
  const text = (english as (key: string, values?: ValidationValues) => string)(key, values);
  issued.set(text, values ? { key, values } : { key });
  return text;
}

/** The key and arguments of a validation message, or null for any other text. */
export function issuedMessage(text: string): IssuedMessage | null {
  return issued.get(text) ?? null;
}
