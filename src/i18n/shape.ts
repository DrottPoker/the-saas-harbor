/**
 * The keys of a set of messages, with any text as the values: another language's messages must
 * have every key of the English ones. `tests/unit/i18n-messages.test.ts` also checks that they have
 * no other keys and use the same arguments.
 */
export type MessageShape<T> = {
  [K in keyof T]: T[K] extends string ? string : MessageShape<T[K]>;
};
