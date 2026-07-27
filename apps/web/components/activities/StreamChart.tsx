/**
 * StreamChart — the activity trace, overlaid (04-DATA-MODEL §5, roadmap Phase 4).
 *
 * Streams have been parsed, packed and stored since the first ingest, and used to compute
 * decoupling — and never shown to anyone, because nothing could unpack them and there was no
 * detail route to draw them on.
 *
 * Same approach as `FormChart`: inline SVG, fixed viewBox, no chart dependency. Each series gets
 * its own y-scale, because heart rate in bpm and power in watts share no axis and forcing them
 * onto one would flatten whichever has the smaller range into a straight line.
 */

interface Series {
  label: string;
  values: number[];
  colour: string;
  unit: string;
  /** Drawn as a filled area behind the lines rather than a line of its own. */
  area?: boolean;
}

const W = 760;
const H = 260;
const PX = 6;
const PT = 14;
const PB = 22;

function path(values: number[], area: boolean): string {
  const n = values.length;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => PX + (i / Math.max(1, n - 1)) * (W - 2 * PX);
  // Areas sit in the bottom two-thirds so they read as terrain under the lines, not as data.
  const y = (v: number) =>
    area ? H - PB - ((v - lo) / span) * (H - PT - PB) * 0.45 : H - PB - ((v - lo) / span) * (H - PT - PB);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return area ? `${line} L ${x(n - 1).toFixed(1)},${(H - PB).toFixed(1)} L ${x(0).toFixed(1)},${(H - PB).toFixed(1)} Z` : line;
}

const summary = (values: number[]) => ({
  avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  max: Math.round(Math.max(...values)),
});

export function StreamChart({ series }: { series: Series[] }) {
  const drawable = series.filter((s) => s.values.length > 1);
  if (drawable.length === 0) return null;

  const gridYs = [0.25, 0.5, 0.75].map((f) => H - PB - f * (H - PT - PB));

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label={`Activity trace: ${drawable.map((s) => s.label).join(', ')}`}>
        {gridYs.map((gy, i) => (
          <line key={i} x1={PX} y1={gy} x2={W - PX} y2={gy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {drawable
          .filter((s) => s.area)
          .map((s) => (
            <path key={s.label} d={path(s.values, true)} fill={s.colour} fillOpacity="0.12" stroke="none" />
          ))}
        {drawable
          .filter((s) => !s.area)
          .map((s) => (
            <path
              key={s.label}
              d={path(s.values, false)}
              fill="none"
              stroke={s.colour}
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {drawable.map((s) => {
          const { avg, max } = summary(s.values);
          return (
            <span key={s.label} className="flex items-baseline gap-2 text-label text-faint">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.colour }} aria-hidden />
              <span className="text-muted">{s.label}</span>
              <span className="font-mono tabular-nums text-text">
                {avg}
                <span className="text-faint"> avg</span>
              </span>
              <span className="font-mono tabular-nums text-faint">
                {max} max {s.unit}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
