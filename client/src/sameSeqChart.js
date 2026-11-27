import { barRects, rowColour } from "./seqMap.js";

export const W = 14, W_FULL = 20;    // one column, in the section and expanded
export const LABEL_W = 78;
const MARK = 17, RULER = 14, BAR = 26, SEQ = 20, GAP = 8, ROW = 16;
export const ONLY = { a: "ss_only_a", b: "ss_only_b" };
export const WHO = { "=": "in both", a: "only in A", b: "only in B", n: "cannot be compared" };
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "sugar" };
export const familyWords = (f) => `${f[0] === "c" ? "cis" : "trans"} ${EDGE[f[1]]}/${EDGE[f[2]]}`;

export function markerSpots(d, w) {
  const xOf = (i) => i * w + w / 2;
  const spots = [];
  for (const x of d.diffs) {
    const xs = x.kind === "step" ? [(x.i + 1) * w] : x.kind === "chem" ? [xOf(x.i)] : [xOf(x.i), xOf(x.j)];
    for (const at of xs) spots.push({ n: x.n, x: at });
  }
  const lines = [];
  for (const s of spots.sort((p, q) => p.x - q.x || p.n - q.n)) {
    const r = String(s.n).length > 1 ? 8 : 7;
    let line = lines.findIndex((ends) => ends.every(([x, rr]) => Math.abs(x - s.x) >= r + rr + 1));
    if (line < 0) { line = lines.length; lines.push([]); }
    lines[line].push([s.x, r]);
    s.line = line;
    s.r = r;
  }
  return { spots, lines: Math.max(1, lines.length) };
}

export function chartOf(d, w) {
  const n = d.length;
  const xOf = (i) => i * w + w / 2;
  const { spots, lines } = markerSpots(d, w);
  const yRuler = lines * MARK + 2;
  const yA = yRuler + RULER + BAR;           // A's bars stand on this line
  const ySeq = yA + 2;
  const yB = ySeq + SEQ + 2;                 // B's bars hang from this one
  const yRows = yB + BAR + GAP;
  const rowY = (k) => yRows + k * ROW + ROW / 2;
  const height = yRows + d.rows.length * ROW + 6;
  const width = Math.ceil(n * w) + 10;       // room for the last number's circle

  const labels = [];
  if (d.diffs.length) labels.push({ y: MARK - 4, text: "differences", cls: "ss_lab_mark" });
  labels.push({ y: yA - 8, text: "A backbone", cls: "" }, { y: ySeq + 14, text: "sequence", cls: "" }, { y: yB + 16, text: "B backbone", cls: "" });
  d.rows.forEach((r, k) => labels.push({ y: rowY(k) + 4, text: r.overflow ? `${r.name} +` : r.name, cls: r.overflow ? "seqmap_over" : "", fill: rowColour(r.name) }));

  const ruler = [];
  d.cols.forEach((c, i) => {
    const num = Number.parseInt(c[1], 10);
    if (c[1] !== c[2] || String(num) !== c[1] || num % 10 !== 0) return;
    ruler.push({ i, x: xOf(i), y: yRuler, num });
  });

  const bw = 10 * Math.min(1, w / W);
  const hOf = (c) => 4 + (BAR - 6) * Math.max(0, Math.min(100, c ?? 0)) / 100;
  const ups = d.steps.a.map(([i, , confal, ntc]) => barRects((i + 1) * w, bw, hOf(confal), yA, ntc));
  const downs = d.steps.b.map(([i, , confal, ntc]) => barRects((i + 1) * w, bw, hOf(confal), 0, ntc));

  const kinds = { seen: [], mod: [], gone: [] };
  d.cols.forEach((c, i) => kinds[!c[3] || !c[4] ? "gone" : c[0] !== c[0].toUpperCase() ? "mod" : "seen"].push(i));
  const letters = Object.entries(kinds).filter(([, cols]) => cols.length)
    .map(([kind, cols]) => ({ kind, x: cols.map(xOf).join(" "), text: cols.map((i) => d.cols[i][0]).join("") }));
  const gaps = [];
  d.cols.forEach((c, i) => {
    if (!c[3]) gaps.push({ key: `${i}a`, x: i * w + 2, y: ySeq });
    if (!c[4]) gaps.push({ key: `${i}b`, x: i * w + 2, y: ySeq + SEQ - 2 });
  });

  const rows = d.rows.map((r, k) => {
    const ends = new Map();
    for (const [i, j, who] of r.pairs) { ends.set(i, who); ends.set(j, who); }
    const tints = [...ends].filter(([, who]) => ONLY[who]).map(([i, who]) => ({ i, x: i * w + 0.5, cls: ONLY[who] }));
    const dots = [];
    [...r.text].forEach((ch, i) => { if (ch === ".") dots.push(i); });
    const marks = [true, false].map((na) => [...ends].filter(([, who]) => (who === "n") === na).map(([i]) => i).sort((p, q) => p - q))
      .map((cols, m) => ({ na: m === 0, x: cols.map(xOf).join(" "), text: cols.map((i) => r.text[i]).join(""), count: cols.length }))
      .filter((m) => m.count);
    return { k, y: rowY(k) + 4, tintY: rowY(k) - ROW / 2 + 1, colour: rowColour(r.name), tints,
             dots: dots.map(xOf).join(" "), dotText: ".".repeat(dots.length), marks };
  });

  const marks = spots.map((s) => ({ ...s, y: s.line * MARK + MARK / 2 + 1, title: d.diffs[s.n - 1].text }));
  return { n, width, height, yA, yB, ySeq, labels, ruler, ups, downs, letters, gaps, rows, marks, rowH: ROW };
}

export function lookupOf(d) {
  const links = Array.from({ length: d.length }, () => []);
  for (const r of d.rows) {
    for (const [i, j, who] of r.pairs) {
      links[i].push({ to: j, family: r.family, wc: r.name === "WC", who });
      links[j].push({ to: i, family: r.family.length === 3 ? r.family[0] + r.family[2] + r.family[1] : r.family, wc: r.name === "WC", who });
    }
  }
  for (const l of links) l.sort((p, q) => p.to - q.to);
  const at = Array.from({ length: d.length }, () => []);
  for (const x of d.diffs) for (const i of x.cols) if (!at[i].includes(x.n)) at[i].push(x.n);
  return {
    links, at,
    steps: { a: new Map(d.steps.a.map((s) => [s[0], s])), b: new Map(d.steps.b.map((s) => [s[0], s])) },
    name: (i) => `${d.cols[i][0].toUpperCase()}${d.cols[i][1] === d.cols[i][2] ? d.cols[i][1] : i + 1}`,
  };
}

export function columnAt(rect, clientX, w, n) {
  const i = Math.floor((clientX - rect.left) / w);
  return i >= 0 && i < n ? i : null;
}

export function scrollFor(x, w, clientWidth, far) {
  const lo = Math.min(...x.cols), hi = Math.max(...x.cols);
  const span = (hi - lo + 1) * w;
  const view = clientWidth - LABEL_W;
  const left = far ? hi * w - view + 40 : span > view ? lo * w - 20 : (lo + hi + 1) / 2 * w - view / 2;
  return { left: Math.max(0, left), long: span > view };
}

export function firstOther(group) {
  const chains = group.entries.flatMap((e) => e.chains);
  const entry = group.ref.split(":")[0] + ":";
  return (chains.find((c) => c.id !== group.ref && !c.id.startsWith(entry)) ?? chains.find((c) => c.id !== group.ref)).id;
}

export const comparePath = (a, b) => `/api/same_sequence/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
