import { NTC_CLASS_COLOURS, NTC_CLASS_NAMES, ntc_classes, ntc_fill } from "../../public/cana.js";

export const W = 14;                 // one column, as the section draws it
const LETTERS = 9;                   // narrower than this, letters give way to ticks
const RULER = 16, SEQ = 20, NTC = 28, ROW = 16, GAP = 6;
export const Y_SEQ = RULER, Y_NTC = RULER + SEQ + 2, Y_ROWS = Y_NTC + NTC + GAP, Y_BASE = Y_NTC + NTC;
export const LABEL_W = 44;

const ROW_COLOUR = { WC: "var(--pair-wc)", cWW: "var(--pair-gu)" };
export const rowColour = (name) => ROW_COLOUR[name] ?? "var(--pair-nc)";
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "sugar" };
const flip = (f) => f[0] + f[2] + f[1];
export const familyWords = (f) => `${f[0] === "c" ? "cis" : "trans"} ${EDGE[f[1]]}–${EDGE[f[2]]}`;
export const rowY = (k) => Y_ROWS + k * ROW + ROW / 2;

export const fileUrl = (map) =>
  `/api/entries/${encodeURIComponent(map.pdb_id)}/sequence_map?strands=${encodeURIComponent(map.shown.join(","))}&format=text`;

export const strandNote = (map, s) => `${s.length} nt` + (s.partners.length
  ? ` · pairs with ${s.partners.map((k) => map.strands.find((t) => t.key === k)?.name ?? k).join(", ")}` : " · no pairs");

export const strandsAfter = (map, s) => map.strands.map((t) => t.key)
  .filter((k) => (k === s.key ? !map.shown.includes(s.key) : map.shown.includes(k)));

export function classKey(ntcs) {
  const used = new Set(ntcs.flatMap((n) => ntc_classes(n)));
  return Object.keys(NTC_CLASS_COLOURS).filter((c) => used.has(c))
    .map((c) => ({ code: c, colour: NTC_CLASS_COLOURS[c], name: NTC_CLASS_NAMES[c] }));
}

// CSS variables go in style: they are not valid as attributes.
export function barRects(x, w, h, bottom, ntc) {
  if (!ntc || ntc === "NANT") {
    return [{ x: x - w / 2 + 0.5, y: bottom - 10.5, width: w - 1, height: 10, rx: 1.5,
              fill: NTC_CLASS_COLOURS.N, strokeWidth: 1, style: { stroke: "var(--ntc-nan-line)" } }];
  }
  const edge = (v) => (v >= 4 ? { className: "ntc_bar" } : {});
  const [a, b] = ntc_fill(ntc);
  if (a === b) return [{ x: x - w / 2, y: bottom - h, width: w, height: h, fill: a, ...edge(w) }];
  return [{ x: x - w / 2, y: bottom - h, width: w / 2, height: h, fill: a, ...edge(w / 2) },
          { x, y: bottom - h, width: w / 2, height: h, fill: b, ...edge(w / 2) }];
}

export function prepare(map) {
  const n = map.cols.length;
  const links = Array.from({ length: n }, () => []);
  const strandOf = [];
  let s = 0;
  map.cols.forEach((c, i) => { if (!c) s++; strandOf[i] = s; });
  map.rows.forEach((r, k) => {
    for (const [i, j] of r.pairs) {
      links[i].push({ k, other: j, family: r.family });
      links[j].push({ k, other: i, family: flip(r.family) });
    }
  });
  const many = map.names.length > 1;
  const starts = map.cols.map((c, i) => (c && (i === 0 || !map.cols[i - 1]) ? i : -1)).filter((i) => i >= 0);
  return {
    n, links, strandOf, starts,
    stepAt: new Map(map.steps.map((st) => [st.i, st])),
    res: (i) => `${many ? map.names[strandOf[i]] + ":" : ""}${map.cols[i][3]}${map.cols[i][1] ?? ""}`,
  };
}

export function drawingOf(map, p, w) {
  const { n, strandOf, starts } = p;
  const xOf = (i) => i * w + w / 2;
  const height = Y_ROWS + map.rows.length * ROW + 4;
  const wide = w >= LETTERS;

  const every = [10, 20, 50, 100, 200, 500, 1000, 2000].find((e) => e * w >= 36) ?? 5000;
  const ruler = [], seps = [];
  map.cols.forEach((c, i) => {
    if (!c) { seps.push({ i, x: xOf(i) }); return; }
    if (starts.includes(i)) { ruler.push({ i, strand: map.names[strandOf[i]] + " 5′", x: i * w + 1 }); return; }
    const num = Number.parseInt(c[1], 10);
    if (Number.isInteger(num) && num % every === 0 && String(num) === String(c[1]) && i - starts.findLast((st) => st <= i) >= 4 * 14 / w) {
      ruler.push({ i, num, x: xOf(i) });
    }
  });

  const kinds = { seen: [], gone: [], mod: [] };
  map.cols.forEach((c, i) => {
    if (c) kinds[!c[2] ? "gone" : c[0] !== c[0].toUpperCase() ? "mod" : "seen"].push(i);
  });
  const letters = wide ? Object.entries(kinds).filter(([, cols]) => cols.length)
    .map(([kind, cols]) => ({ kind, x: cols.map(xOf).join(" "), text: cols.map((i) => map.cols[i][0]).join("") })) : [];
  const lines = wide ? null : {
    runs: starts.map((st) => { let e = st; while (e + 1 < n && map.cols[e + 1]) e++; return { x: st * w, width: (e - st + 1) * w }; }),
    gone: kinds.gone.map((i) => i * w),
    mod: kinds.mod.map((i) => i * w),
  };

  const bw = wide ? 10 * Math.min(1, w / W) : Math.max(0.8, w * 0.85);
  const bars = map.steps.map((st, n) => {
    const h = 4 + (NTC - 6) * Math.max(0, Math.min(100, st.confal ?? 0)) / 100;
    const x = (st.i + 1) * w;
    return { n, i: st.i, rects: st.ntc || bw >= 6 ? barRects(x, bw, h, Y_NTC + NTC, st.ntc) : null, thin: { x: x - bw / 2, width: bw } };
  });

  // Nothing under a bracket: a mark there reads as a dot inside it.
  const rows = map.rows.map((r, k) => {
    const ends = r.pairs.flat().sort((a, b) => a - b);
    const dots = [];
    [...r.text].forEach((ch, i) => { if (ch === ".") dots.push(i); });
    return { k, y: rowY(k) + 4, colour: rowColour(r.name), ticks: r.pairs.flat().map((i) => i * w),
             dots: dots.map(xOf).join(" "), dotText: ".".repeat(dots.length),
             marks: ends.map(xOf).join(" "), markText: ends.map((i) => r.text[i]).join("") };
  });

  return { width: Math.ceil(n * w), height, wide, xOf, ruler, seps, letters, lines, bw, bars, rows, band: Math.max(w, 2) };
}

export function columnAt(rect, clientX, w, n) {
  const i = Math.floor((clientX - rect.left) / w);
  return i >= 0 && i < n ? i : null;
}

export const centreOn = (i, w, viewWidth) => i * w + w / 2 - (viewWidth - LABEL_W) / 2;

export const W_MIN = 0.5, W_MAX = 28;     // the zoom buttons' range; Fit may go narrower

export const fitWidth = (clientWidth, n) => Math.max(0.02, Math.min(W, (clientWidth - LABEL_W - 4) / n));

export function zoomed(was, w, left, clientWidth, n, at) {
  const view = clientWidth - LABEL_W;
  const there = at ?? view / 2;
  const next = Math.max(Math.min(W_MIN, fitWidth(clientWidth, n)), Math.min(W_MAX, w));
  return { w: next, left: (left + there) / was * next - there };
}

export function overviewOf(map, p) {
  const bands = p.starts.map((s, k) => {
    let e = s;
    while (e + 1 < p.n && map.cols[e + 1]) e++;
    return { s, width: e - s + 1, alt: k % 2 === 1 };
  });
  const steps = map.steps.map((s, n) => ({ n, s })).filter(({ s }) => s.ntc).map(({ n, s }) => ({ n, i: s.i, fill: ntc_fill(s.ntc)[0] }));
  const names = p.starts.map((s, k) => ({ s, name: map.names[k], left: `${(s / p.n * 100).toFixed(3)}%` }));
  return { bands, steps, names };
}

export const viewBox = (left, clientWidth, w, n) => ({ x: Math.max(0, left / w), width: Math.max(0, Math.min(n, (clientWidth - LABEL_W) / w)) });

export const quickPick = (map, pick) => pick === "all" ? map.strands.map((s) => s.key)
  : map.strands.filter((s) => map.shown.includes(s.key) || s.partners.some((k) => map.shown.includes(k))).map((s) => s.key);
