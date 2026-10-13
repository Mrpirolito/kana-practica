export type Pt = [number, number];
export type StrokeVerdict = 'ok' | 'reversed' | 'wrong';

const SAMPLES = 32;

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Resample a polyline to n points evenly spaced along its length
export function resample(pts: Pt[], n = SAMPLES): Pt[] {
  const seg = pts.slice(1).map((p, i) => dist(pts[i], p));
  const total = seg.reduce((a, b) => a + b, 0);
  if (total === 0) return Array(n).fill(pts[0]);
  const out: Pt[] = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (i < seg.length - 1 && acc + seg[i] < target) acc += seg[i++];
    const t = seg[i] ? Math.min(1, (target - acc) / seg[i]) : 0;
    out.push([
      pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
      pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
    ]);
  }
  return out;
}

const pathCache = new Map<string, { pts: Pt[]; len: number }>();

// Sample an SVG path (KanjiVG 109x109 viewBox) into evenly spaced points
export function samplePath(d: string) {
  const hit = pathCache.get(d);
  if (hit) return hit;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  const len = el.getTotalLength();
  const pts = Array.from({ length: SAMPLES }, (_, i) => {
    const p = el.getPointAtLength((len * i) / (SAMPLES - 1));
    return [p.x, p.y] as Pt;
  });
  const res = { pts, len };
  pathCache.set(d, res);
  return res;
}

// Several consecutive strokes written as one (e.g. the 2-stroke さ or 3-stroke き)
function joinedPath(ds: string[]) {
  const pts = resample(ds.flatMap(d => samplePath(d).pts));
  const len = pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  return { pts, len };
}

/**
 * Judge a stroke, also accepting it as the current and next stroke joined into one
 * (handwritten variants like さ, き, り). Returns how many reference strokes it covered.
 */
export function judgeStrokeOrJoined(
  user: Pt[],
  strokes: string[],
  idx: number,
  offset: Pt | null,
): { verdict: StrokeVerdict; offset: Pt | null; covered: number } {
  const single = judgeStroke(user, strokes[idx], offset);
  if (single.verdict === 'ok' || idx + 1 >= strokes.length) return { ...single, covered: 1 };
  const joined = judgeStroke(user, [strokes[idx], strokes[idx + 1]], offset);
  return joined.verdict === 'ok' ? { ...joined, covered: 2 } : { ...single, covered: 1 };
}

const centroid = (pts: Pt[]): Pt => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];
/** How far (viewBox units) the whole kana may be drawn away from the reference */
const MAX_OFFSET = 30;

/**
 * Compare a drawn stroke against the reference stroke.
 * Shape is judged after aligning centroids, so drawing the kana shifted works.
 * `offset` is where the user is drawing relative to the reference (from earlier
 * strokes of the same kana); the stroke must sit near reference + offset.
 * Returns the offset to use for the next stroke.
 */
export function judgeStroke(
  user: Pt[],
  d: string | string[],
  offset: Pt | null = null,
): { verdict: StrokeVerdict; offset: Pt | null } {
  if (user.length < 2) return { verdict: 'wrong', offset };
  const ref = Array.isArray(d) ? joinedPath(d) : samplePath(d);
  const u = resample(user);
  const tol = Math.max(13, Math.min(20, ref.len * 0.25));
  const [ux, uy] = centroid(u);
  const [rx, ry] = centroid(ref.pts);
  const shift: Pt = [ux - rx, uy - ry];
  const aligned = u.map(([x, y]) => [x - shift[0], y - shift[1]] as Pt);
  const mean = (a: Pt[], b: Pt[]) =>
    a.reduce((s, p, i) => s + dist(p, b[i]), 0) / a.length;
  const fwd = mean(aligned, ref.pts);
  const rev = mean([...aligned].reverse(), ref.pts);
  const userLen = u.slice(1).reduce((s, p, i) => s + dist(u[i], p), 0);
  const lenOk = userLen > ref.len * 0.4 && userLen < ref.len * 2.2 + 10;
  // First stroke: any position inside the box; later strokes: relative to the first
  const placed = offset
    ? dist(shift, offset) < Math.max(tol, 22)
    : Math.hypot(shift[0], shift[1]) < MAX_OFFSET;
  // Short strokes (dots, ticks) are noisy when drawn quickly: judge them more loosely
  const shapeTol = ref.len < 35 ? tol : tol * 0.85;
  if (lenOk && placed && fwd < shapeTol) {
    // Running average so a hand that drifts while drawing keeps being followed
    const next: Pt = offset ? [(offset[0] + shift[0]) / 2, (offset[1] + shift[1]) / 2] : shift;
    return { verdict: 'ok', offset: next };
  }
  if (lenOk && placed && rev < shapeTol) return { verdict: 'reversed', offset };
  return { verdict: 'wrong', offset };
}
