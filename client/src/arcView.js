// The arc viewer's drawing as numbers (public/arc_viewer.js): where each
// nucleotide, arc, letter and tick sits for a size and a zoom. Pure, so
// ArcViewer only draws what this says. d: /api/entries/:id/arcs, whose pairs
// are [a, b, kind, ?, family, name a, name b, under].
import { number } from "./format.js";

export const KIND = { wc: "cWW Watson–Crick", gu: "cWW G–U", nc: "Others" };
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "Sugar" };
const TOP = 14, PAD = 22, GAP = 24;
// Pairs that cross the ones above the line hang under it, from just below the
// letters; depth is the room they take, 0 when there are none.
const FOOT = 20;
export const under = (p) => p[7] === 1;
const LW = /^[ct][WHS][WHS]$/;

// The drawing is as many units as the screen has pixels, so text is the same
// size on a phone as on a computer. width, height: the svg's on screen.
export function frameOf(width, height, d) {
  const W = Math.max(300, Math.round(width));
  const H = Math.max(220, Math.min(Math.round(height), Math.round(W * 0.6)));
  const depth = d.pairs.some(under) ? Math.round((H - 58 - TOP) * 0.3) : 0;
  return { W, H, depth, base: H - 58 - depth };
}

// Where nucleotide i of the whole line sits before zooming.
export function layoutOf(d, W) {
  const total = d.strands.reduce((n, s) => n + s.length, 0);
  const k = d.strands.length, room = W - 2 * PAD;
  const gap = k > 1 ? Math.min(GAP, room * 0.25 / (k - 1)) : 0;
  const step = (room - gap * (k - 1)) / total;
  const strandOf = new Int32Array(total + 2);
  d.strands.forEach((s, j) => { for (let i = s.start + 1; i <= s.start + s.length; i++) strandOf[i] = j; });
  return {
    room, step, gap, strandOf,
    x: (i) => PAD + strandOf[i] * gap + (i - 0.5) * step,
    ends: (s, j) => [PAD + j * gap + s.start * step, PAD + j * gap + (s.start + s.length) * step],
  };
}

// An arc's control height on screen: it follows the arc's width, capped at
// the top of the drawing, or at the bottom of the room under the line.
function arcHeight(f, L, xa, xb, low) {
  const reach = low ? f.depth - FOOT - 8 : f.base - TOP - 3;
  return (3 + reach * Math.min(1, (xb - xa) / L.room)) / 0.75;
}

export const FIT = { s: 1, tx: 0 };
const clampTx = (tx, s, W) => Math.min(0, Math.max(W - W * s, tx));

// The zoom after a factor f around picture x cx, the fit being 1.
export function zoomBy(z, by, cx, L, W) {
  const s = Math.min(Math.max(80, 16 / L.step), Math.max(1, z.s * by));
  return { s, tx: clampTx(cx - (cx - z.tx) * (s / z.s), s, W) };
}

// The zoom moved sideways to tx.
export const panTo = (z, tx, W) => ({ s: z.s, tx: clampTx(tx, z.s, W) });

const screen = (z) => (v) => z.tx + z.s * v;

// The strands' lines, and each arc's path with the point its symbol sits on:
// only an Other wide enough on screen carries one.
export function drawing(d, f, L, z) {
  const sx = screen(z);
  const strands = d.strands.map((s, j) => L.ends(s, j).map(sx));
  const arcs = d.pairs.map((p) => {
    const [a, b, kind] = p;
    const low = under(p), foot = low ? f.base + FOOT : f.base;
    const xa = sx(L.x(a)), xb = sx(L.x(b)), h = arcHeight(f, L, xa, xb, low) * (low ? 1 : -1), y = foot + h;
    const path = `M${xa.toFixed(1)} ${foot}C${xa.toFixed(1)} ${y.toFixed(1)} ${xb.toFixed(1)} ${y.toFixed(1)} ${xb.toFixed(1)} ${foot}`;
    const symbol = kind === "nc" && xb - xa >= 22 && xb > 0 && xa < f.W ? { x: (xa + xb) / 2, y: foot + h * 0.75 } : null;
    return { path, symbol };
  });
  return { strands, arcs };
}

// The marks on the line: letters once there is room for them (modified ones
// white on dark), before that a dot for each modified residue. Only those on
// screen. Each: { key, x, mod, letter } with letter null for a dot.
export function letters(d, f, L, z) {
  const sx = screen(z);
  const room = L.step * z.s;
  const out = [];
  d.strands.forEach((s, j) => {
    const first = Math.max(1, Math.floor((-z.tx / z.s - PAD - j * L.gap) / L.step) - s.start - 1);
    for (let pos = first; pos <= s.length; pos++) {
      const x = sx(L.x(s.start + pos));
      if (x < -10) continue;
      if (x > f.W + 10) break;
      const mod = s.modified.includes(pos);
      if (room >= 10) out.push({ key: `${j} ${pos}`, x, mod, letter: s.sequence?.[pos - 1] ?? "·" });
      else if (mod) out.push({ key: `${j} ${pos}`, x, mod, letter: null });
    }
  });
  return out;
}

// The two ends of pair i, on screen.
export const endsOf = (d, L, z, i) => d.pairs[i].slice(0, 2).map((n) => screen(z)(L.x(n)));

// A ruler counted from each strand's 5′ end, spaced so labels never touch,
// under the arcs below the line, with each strand's ends and name. Per strand
// on screen: { ticks: [{ x, p }], ends: [x1, x2] | null, name: { x, text } | null }.
export function ruler(d, f, L, z) {
  const sx = screen(z);
  const every = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((n) => n * L.step * z.s >= 44) ?? 2000;
  return d.strands.map((s, j) => {
    const [x1, x2] = L.ends(s, j).map(sx);
    if (x2 < 0 || x1 > f.W) return null;
    const ticks = [];
    for (let p = every; p <= s.length; p += every) {
      const x = sx(L.x(s.start + p));
      if (x >= 0 && x <= f.W) ticks.push({ x, p });
    }
    const room = Math.min(x2, f.W) - Math.max(x1, 0);
    return {
      key: j,
      ticks,
      ends: room >= 70 ? [Math.max(x1, 4), Math.min(x2, f.W - 4)] : null,
      name: (d.strands.length > 1 || s.symmetry) && room >= 24 ? { x: (Math.max(x1, 0) + Math.min(x2, f.W)) / 2, text: s.name } : null,
    };
  }).filter(Boolean);
}

// The pair nearest a picture point, within a finger's width (14 screen
// pixels, k units each), so a thin line need not be hit exactly. Each arc is
// a cubic with its control points straight above (or below) its ends:
// x = a + (b - a)(3t² - 2t³), y = foot ∓ h·3t(1 - t). fam: only that family.
export function nearestPair(d, f, L, z, fam, { x, y, k }) {
  const sx = screen(z);
  let best = null, within = 14 / k;
  d.pairs.forEach(([a, b, , , family, , , low], i) => {
    if (fam && family !== fam) return;
    const xa = sx(L.x(a)), xb = sx(L.x(b));
    if (x < xa - within || x > xb + within) return;
    const at = Math.min(1, Math.max(0, (x - xa) / (xb - xa || 1)));
    let lo = 0, hi = 1;
    for (let n = 0; n < 12; n++) {
      const t = (lo + hi) / 2;
      if (3 * t * t - 2 * t * t * t < at) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2;
    const h = arcHeight(f, L, xa, xb, low) * 3 * t * (1 - t);
    const gap = Math.abs(y - (low ? f.base + FOOT + h : f.base - h));
    if (gap < within) { within = gap; best = i; }
  });
  return best;
}

// The Leontis–Westhof symbol of a family: one shape per edge, a circle for
// Watson–Crick, a square for Hoogsteen, a triangle for Sugar; filled for cis,
// open for trans. Centred on x, y. null for a family not written that way.
export function glyphOf(fam, x, y, r = 4.5) {
  if (!LW.test(fam)) return null;
  const one = (e, cx) => e === "W" ? { tag: "circle", cx, cy: y, r }
    : e === "H" ? { tag: "rect", x: cx - r, y: y - r, width: 2 * r, height: 2 * r }
    : { tag: "path", d: `M${cx - r - 1} ${y + r}L${cx + r + 1} ${y + r}L${cx} ${y - r - 1}Z` };
  return { fill: fam[0] === "c" ? "currentColor" : "var(--bg-secondary)", shapes: [one(fam[1], x - r - 1), one(fam[2], x + r + 1)] };
}

export const familyWords = (f) => LW.test(f) ? `${f[0] === "c" ? "cis" : "trans"} ${EDGE[f[1]]} / ${EDGE[f[2]]}` : f;

// Whether nucleotide i of the whole line is a modified residue.
export function isModified(d, L, i) {
  const s = d.strands[L.strandOf[i]];
  return s.modified.includes(i - s.start);
}

// The counts above the drawing.
export function countsOf(d) {
  const kinds = { wc: 0, gu: 0, nc: 0 };
  const families = new Set();
  for (const p of d.pairs) { kinds[p[2]]++; if (p[2] === "nc") families.add(p[4]); }
  return {
    kinds,
    families: families.size,
    nucleotides: d.strands.reduce((n, s) => n + s.length, 0),
    modified: d.strands.reduce((n, s) => n + s.modified.length, 0),
  };
}

// Every family with its pairs, the most first (ties in the order they come).
export function familyCounts(d) {
  const by = new Map();
  for (const p of d.pairs) by.set(p[4], (by.get(p[4]) ?? 0) + 1);
  return [...by].sort((x, y) => y[1] - x[1]);
}

// What the panel under the drawing says of pair i: its family in words, its
// kind, its span on one strand, and its modified ends.
export function pairFacts(d, L, i) {
  const [a, b, kind, , fam, nameA, nameB] = d.pairs[i];
  const mods = [[a, nameA], [b, nameB]].filter(([n]) => isModified(d, L, n)).map(([, n]) => n);
  const facts = [familyWords(fam), KIND[kind]];
  if (L.strandOf[a] === L.strandOf[b]) facts.push(`spans ${number(b - a)} nt`);
  if (mods.length) facts.push(`modified: ${mods.join(", ")}`);
  return facts.join(" · ");
}

// The arcs' line width: thinner the more pairs there are.
export const strokeOf = (d) => Math.max(0.7, 1.8 * Math.min(1, Math.sqrt(40 / Math.max(1, d.pairs.length))));

// A pointer in picture units, k units to a screen pixel: the picture keeps
// its shape and is centred in the svg's box (rect).
export function pictureOf(rect, f, ev) {
  const k = Math.min(rect.width / f.W, rect.height / f.H);
  return { x: (ev.clientX - rect.left - (rect.width - f.W * k) / 2) / k,
           y: (ev.clientY - rect.top - (rect.height - f.H * k) / 2) / k, k };
}

// Which pairs stand out: the pointed or picked one (on), else those of the
// chosen family; null when none does.
export function litOf(d, on, fam) {
  if (on != null) return (i) => i === on;
  return fam ? (i) => d.pairs[i][4] === fam : null;
}
