// The main navigation, with message keys in chrome.nav. New arrivals is Browse in another order,
// so Browse covers it.
export const sections = [
  ["/", "leaderboard", []],
  ["/browse", "browse", ["/newest"]],
] as const;
