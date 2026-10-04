// The main navigation. New arrivals is Browse in another order, so Browse covers it.
export const sections = [
  ["/", "Leaderboard", []],
  ["/browse", "Browse", ["/newest"]],
] as const;
