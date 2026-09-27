import type { CSSProperties } from "react";

// A wedge of the --beam color from the lantern: a narrow core with a faint haze either side, 18
// degrees each way, fading along its length. Each stop is a share of the full color.
const profile: [degrees: number, share: number][] = [
  [0, 0],
  [6, 10],
  [12, 24],
  [15, 58],
  [18, 100],
  [21, 58],
  [24, 24],
  [30, 10],
  [36, 0],
];
const stops = profile.map(
  ([degrees, share]) => `color-mix(in srgb, var(--beam) ${share}%, transparent) ${degrees}deg`,
);
const style: CSSProperties = {
  background: `conic-gradient(from 72deg at 0 50%, ${stops.join(", ")})`,
  maskImage:
    "radial-gradient(circle farthest-side at 0 50%, #000 20%, rgb(0 0 0 / 0.6) 55%, transparent)",
};

/**
 * The light of the lighthouse in the logo, sweeping across the top of the home page. It is
 * placed against the page itself, not the section it sits in, so it starts at the lantern of the
 * logo in the header on every screen size: no ancestor of it may be positioned.
 */
export function LighthouseBeam() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[48rem] overflow-hidden"
    >
      {/* The same box as the header's, whose padding puts the logo 1 or 1.5 rem in. */}
      <div className="relative mx-auto h-full max-w-6xl">
        {/* The lantern, 14 px into the logo and 17 px down. Steeper on phones, where the header
            is taller. */}
        <div className="absolute top-[17px] left-[calc(1rem+14px)] rotate-[34deg] sm:left-[calc(1.5rem+14px)] md:rotate-[24deg]">
          <div
            style={style}
            className="absolute top-0 left-0 aspect-[3/2] w-[36rem] origin-left -translate-y-1/2 animate-beam md:w-[68rem]"
          />
        </div>
      </div>
    </div>
  );
}
