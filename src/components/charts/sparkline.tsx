import { sparklinePoints, type MrrPoint } from "@/lib/charts";
import { cn } from "@/lib/utils";

const WIDTH = 96;
const HEIGHT = 28;
const INSET = 4; // room for the end dot and its ring

/** A zero-based trend line: the history in a muted line, the latest month as an accent dot. */
export function Sparkline({ history, className }: { history: MrrPoint[]; className?: string }) {
  const points = sparklinePoints(history, WIDTH, HEIGHT, INSET);
  const end = points.at(-1)!;
  return (
    <svg
      aria-hidden="true"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("overflow-visible", className)}
    >
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        className="stroke-chart-muted"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={end.x}
        cy={end.y}
        r={3}
        className="fill-chart-1 stroke-surface"
        strokeWidth={1.5}
      />
    </svg>
  );
}
