export const LABEL = 7;   // "seq", "WC", "tWH"... padded so the columns line up

export const HINT = "Point at or tap a nucleotide to see what it pairs with.";

export function lbnLines(map) {
  let names = "";
  let at = 0;
  map.seq.split("&").forEach((strand, n) => {
    names = names.padEnd(at) + map.names[n].slice(0, strand.length);
    at += strand.length + 1;
  });
  const line = (label, text) => label.padEnd(LABEL) + text;
  return [line("", names), line("seq", map.seq), ...map.rows.map((r) => line(r.name, r.text))];
}

export function columnKey(map, i) {
  if (!map.cols[i]) return null;
  return `${map.shown[map.seq.slice(0, i).split("&").length - 1]} ${map.cols[i][4]}`;
}

export const pairKey = (a, b) => [a, b].sort().join("|");

function residue(map, i) {
  const strand = map.seq.slice(0, i).split("&").length - 1;
  const [, num, , code] = map.cols[i];
  return `${map.names.length > 1 ? map.names[strand] + ":" : ""}${code}${num ?? ""}`;
}

// Read from this base: a tHW pair is tWH from the other end.
export function columnWords(map, i) {
  if (!map.cols[i]) return null;
  const partners = [];
  for (const r of map.rows) {
    for (const [a, b] of r.pairs) {
      if (a !== i && b !== i) continue;
      const family = r.name === "WC" || a === i ? r.name : r.name[0] + r.name[2] + r.name[1];
      partners.push({ col: a === i ? b : a, text: `${residue(map, a === i ? b : a)} (${family})` });
    }
  }
  return { partners: partners.map((p) => p.col), head: `${residue(map, i)}${map.cols[i][2] ? "" : ", not in the model"}`, items: partners };
}

export function pairColumns(map, a, b) {
  const at = new Map(map.cols.map((c, i) => [columnKey(map, i), i]));
  const [i, j] = [at.get(a), at.get(b)];
  return i === undefined || j === undefined ? null : [i, j];
}

export const strandsOf = (a, b) => [...new Set([a, b].map((k) => k.split(" ")[0]))];

export function scrollFor(i, j, { width, left }, room) {
  const [x, y] = [left + Math.min(i, j) * width, left + (Math.max(i, j) + 1) * width];
  return y - x < room - 2 * width ? (x + y - room) / 2 : x - room / 2;
}

export function rowsByPair(pairs) {
  const rows = new Map();
  for (const p of pairs) {
    const key = pairKey(p.ends[0], p.ends[1]);
    if (!rows.has(key)) rows.set(key, rowKey(p));
  }
  return rows;
}

export const rowKey = (p) => `${p.ends.join("|")}|${p.family}`;
