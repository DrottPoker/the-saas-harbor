import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The --shadow-* tokens in globals.css, which would otherwise be read as shadow colors.
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ["control", "button", "card", "raised", "float"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
