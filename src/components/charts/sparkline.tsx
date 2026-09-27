import type { CSSProperties } from "react";
import { sparklinePoints, type MrrPoint } from "@/lib/charts";
import { cn } from "@/lib/utils";

const WIDTH = 96;
const HEIGHT = 28;
const INSET = 4; // room for the end dot and its ring

/**
 * A zero-based trend line: the history in a muted line, the latest month as an accent dot. It
 * draws itself once on load; `order` staggers the lines of a list, row after row.
 */
export function Sparkline({
  history,
  order = 0,
  className,
}: {
  history: MrrPoint[];
  order?: number;
  className?: string;
}) {
  const points = sparklinePoints(history, WIDTH, HEIGHT, INSET);
  const end = points.at(-1)!;
  // Capped, so a long page does not keep the last lines waiting. The dot follows its line.
  const delay = 150 + Math.min(order, 10) * 60;
  const line: CSSProperties = { animationDelay: `${delay}ms` };
  const dot: CSSProperties = { animationDelay: `${delay + 900}ms` };
  return (
    <svg
      aria-hidden="true"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("overflow-visible", className)}
    >
      {/* A path length of 1 lets the dash offset draw the line. The dash starts just before the
          line, so its round cap does not show as a dot there, and the gap is longer than the line. */}
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        pathLength={1}
        style={line}
        strokeDasharray="1 2"
        fill="none"
        className="animate-draw stroke-chart-muted"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={end.x}
        cy={end.y}
        r={3}
        style={dot}
        className="animate-dot-in fill-chart-1 stroke-surface transform-fill origin-center"
        strokeWidth={1.5}
      />
    </svg>
  );
}
