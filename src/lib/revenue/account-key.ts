// A key that belongs to a site or project is stored together with it, as one encrypted value, so
// every later verification reads the same account. Neither part contains a colon.

export function joinAccountKey(account: string, key: string) {
  return `${account}:${key}`;
}

export function splitAccountKey(stored: string) {
  const at = stored.indexOf(":");
  return { account: stored.slice(0, at), key: stored.slice(at + 1) };
}
