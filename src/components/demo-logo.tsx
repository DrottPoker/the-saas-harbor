import type { DemoDetails, DemoShape } from "@/lib/demo";

// Logo artwork for the made-up demo products in src/lib/demo.ts. Like an uploaded logo, its colors
// belong to the artwork, not to the theme.
const ink = "#fff";
const line = {
  stroke: ink,
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none",
} as const;

const shapes: Record<DemoShape, (color: string) => React.ReactNode> = {
  bars: () => (
    <>
      <rect x="12" y="25" width="6" height="11" rx="1.5" fill={ink} />
      <rect x="21" y="18" width="6" height="18" rx="1.5" fill={ink} />
      <rect x="30" y="11" width="6" height="25" rx="1.5" fill={ink} />
    </>
  ),
  tray: () => (
    <>
      <path d="M16.5 21 19 13h10l2.5 8" {...line} />
      <path
        d="M11 24h8.5l2 4h5l2-4H37v8.5a3.5 3.5 0 0 1-3.5 3.5h-19a3.5 3.5 0 0 1-3.5-3.5z"
        fill={ink}
      />
    </>
  ),
  clock: () => (
    <>
      <circle cx="24" cy="24" r="12.5" {...line} strokeWidth={3.5} />
      <path d="M24 16.5V24l5 3" {...line} strokeWidth={3.5} />
    </>
  ),
  house: (color) => (
    <>
      <path d="M11 23.5 24 12l13 11.5V36H11z" fill={ink} />
      <rect x="20.5" y="27" width="7" height="9" rx="1" fill={color} />
    </>
  ),
  retry: () => (
    <>
      <path d="M33.6 20.5a10 10 0 1 0 .4 5" {...line} strokeWidth={3.5} />
      <path d="M34.5 12.5v8h-8" {...line} strokeWidth={3.5} />
    </>
  ),
  line: () => (
    <>
      <path d="m12 32 8-8 6 5 9-11" {...line} strokeWidth={3.5} />
      <circle cx="35" cy="18" r="3.5" fill={ink} />
    </>
  ),
  wave: () => (
    <>
      <rect x="12.5" y="20" width="3.5" height="8" rx="1.75" fill={ink} />
      <rect x="19" y="15" width="3.5" height="18" rx="1.75" fill={ink} />
      <rect x="25.5" y="11" width="3.5" height="26" rx="1.75" fill={ink} />
      <rect x="32" y="17" width="3.5" height="14" rx="1.75" fill={ink} />
    </>
  ),
  phone: () => (
    <>
      <rect x="16.5" y="10" width="15" height="28" rx="3.5" {...line} />
      <path d="M21.5 33h5" {...line} strokeWidth={2.5} />
    </>
  ),
  steps: () => <path d="M11 36v-8h8.5v-7.5H28V13h9v23z" fill={ink} />,
  toggle: () => (
    <>
      <rect x="10" y="16.5" width="28" height="15" rx="7.5" {...line} />
      <circle cx="30.5" cy="24" r="4.5" fill={ink} />
    </>
  ),
  quote: (color) => (
    <>
      <path
        d="M11 14.5a2.5 2.5 0 0 1 2.5-2.5h21a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1-2.5 2.5H21l-6.5 5.5V31h-1a2.5 2.5 0 0 1-2.5-2.5z"
        fill={ink}
      />
      <path d="m24 15.5 1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill={color} />
    </>
  ),
  jar: () => (
    <>
      <path d="M15.5 12.5h17" {...line} />
      <path d="M17 17h14v15.5a3.5 3.5 0 0 1-3.5 3.5h-7a3.5 3.5 0 0 1-3.5-3.5z" {...line} />
      <circle cx="24" cy="27" r="3.5" fill={ink} />
    </>
  ),
  loop: () => (
    <>
      <rect x="16.5" y="10.5" width="15" height="27" rx="7.5" {...line} strokeWidth={3.5} />
      <path d="M24 18v12" {...line} />
    </>
  ),
  swatches: () => (
    <>
      <rect x="12" y="12" width="10" height="10" rx="2.5" fill={ink} />
      <rect x="26" y="12" width="10" height="10" rx="2.5" fill={ink} fillOpacity={0.7} />
      <rect x="12" y="26" width="10" height="10" rx="2.5" fill={ink} fillOpacity={0.7} />
      <rect x="26" y="26" width="10" height="10" rx="2.5" fill={ink} fillOpacity={0.45} />
    </>
  ),
  calendar: () => (
    <>
      <rect x="11" y="13" width="26" height="23" rx="3.5" {...line} />
      <path d="M11 20.5h26M18 10v6M30 10v6" {...line} />
      <rect x="25" y="25" width="6.5" height="6" rx="1.5" fill={ink} />
    </>
  ),
};

/** A demo product's logo, filling the box it is drawn in. */
export function DemoLogo({ logo }: { logo: DemoDetails["logo"] }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-full">
      <rect width="48" height="48" fill={logo.color} />
      {shapes[logo.shape](logo.color)}
    </svg>
  );
}
