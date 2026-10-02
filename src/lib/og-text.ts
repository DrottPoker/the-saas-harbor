// Text for the sharing images that next/og (Satori) draws (src/components/og-card.tsx).
import { excerpt } from "@/lib/moderation";

const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/**
 * A line that never breaks. Satori measures some words too wide where it may break a line, which
 * leaves uneven gaps between them; a line joined by no-break spaces is measured whole.
 */
export function ogLine(text: string) {
  return text.replaceAll(" ", NO_BREAK_SPACE);
}

function breakLines(words: string[], width: number) {
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= width)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/**
 * Text in at most `max` lines of about `width` characters, broken between words here rather than
 * by Satori (see `ogLine`), as evenly as fits, and cut with an ellipsis when it runs longer.
 */
export function ogLines(text: string, width: number, max: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let lines = breakLines(words, width);
  // The narrowest width that needs no more lines, so the last line is not left with a word or two.
  if (lines.length > 1 && lines.length <= max)
    for (
      let narrower = Math.ceil(words.join(" ").length / lines.length);
      narrower < width;
      narrower++
    ) {
      const even = breakLines(words, narrower);
      if (even.length <= lines.length) {
        lines = even;
        break;
      }
    }
  const kept = lines.slice(0, max).map((text) => excerpt(text, width));
  if (lines.length > max) kept[max - 1] = excerpt(`${kept[max - 1]} ${lines[max]}`, width);
  return kept.map(ogLine);
}
