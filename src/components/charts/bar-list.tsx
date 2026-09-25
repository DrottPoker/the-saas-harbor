/**
 * A few counts as horizontal bars, each with its value in text at the bar's end, so a list of
 * rows reads the same without the bars. Bars are 12 px thick with a rounded end and grow from one
 * baseline; the widest takes the track less the room its value needs.
 */
export function BarList({
  label,
  rows,
}: {
  label: string;
  rows: { label: string; value: number; text: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul aria-label={label} className="grid gap-3">
      {rows.map((row) => (
        <li
          key={row.label}
          className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]"
        >
          <span className="text-muted-foreground">{row.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            {row.value > 0 && (
              <span
                aria-hidden="true"
                className="h-3 shrink-0 rounded-r-[4px] bg-chart-1"
                style={{ width: `max(4px, calc((100% - 6.5rem) * ${row.value / max}))` }}
              />
            )}
            <span className="shrink-0 tabular-nums">{row.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
