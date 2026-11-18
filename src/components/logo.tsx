import { useId } from "react";
import Link from "@/components/link";
import { isGradient, LOGO_GRADIENTS, LOGO_PARTS, LOGO_VIEWBOX, type LogoColor } from "@/lib/logo";
import { SITE_NAME } from "@/lib/seo";
import { cn } from "@/lib/utils";

// The --logo-* tokens in globals.css, which switch with the theme.
const token = (color: LogoColor) =>
  `var(--logo-${color.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)})`;

export function LogoMark({ className }: { className?: string }) {
  // Gradient ids are unique per mark, so one hidden copy never blanks another.
  const id = useId();
  return (
    <svg viewBox={LOGO_VIEWBOX} aria-hidden="true" className={cn("size-10 shrink-0", className)}>
      <defs>
        {LOGO_GRADIENTS.map(({ name, x1, y1, x2, y2, stops }) => (
          <linearGradient
            key={name}
            id={`${id}${name}`}
            gradientUnits="userSpaceOnUse"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          >
            {stops.map((stop, index) => (
              <stop
                key={index}
                offset={index}
                style={{ stopColor: token(stop.color), stopOpacity: stop.opacity }}
              />
            ))}
          </linearGradient>
        ))}
      </defs>
      {LOGO_PARTS.map(({ paint, d }) => (
        <path
          key={paint}
          d={d}
          style={{ fill: isGradient(paint) ? `url(#${id}${paint})` : token(paint) }}
        />
      ))}
    </svg>
  );
}

/**
 * The mark with the name beside it. Where a row has no room for both, such as the header on a
 * phone in a language with long labels, the name gives way and the mark stays: the link may shrink
 * to the mark's width, and a name that no longer fits on its line wraps below it, out of sight.
 * No width is named, so it holds in every language.
 */
export function Brand() {
  return (
    // The label keeps the name in one piece; the two lines are separate boxes.
    <Link
      href="/"
      aria-label={SITE_NAME}
      className="flex h-10 min-w-10 flex-wrap content-start items-center gap-x-2 overflow-hidden"
    >
      <LogoMark />
      <span className="flex h-10 flex-col justify-center leading-none tracking-tight text-logo-ink">
        <span className="text-xs font-semibold">The</span>
        <span className="text-[17px] font-bold">SaaS Harbor</span>
      </span>
    </Link>
  );
}
