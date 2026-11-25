// The name list under a panel box (app.js, input[data-suggest]): organisms,
// hosts, ligands, residues, loaded once and narrowed as you type. Picking one
// only fills the box; Search still runs the search.
//
// list: { text, open, active }. text: what the list was last drawn for (null:
// never drawn). Closed, it keeps what it showed, hidden.

export const SHOWN = 8;
export const CLOSED = { text: null, open: false, active: -1 };

// Best match first, as UniProt's taxonomy suggester does: "human" puts Homo
// sapiens (common name human) above Human adenovirus 2. Within a rank, the
// server's order (most entries first) stands.
function rank(s, text) {
  const code = s.code.toLowerCase();
  const names = (s.name ?? "").toLowerCase().split(/,\s*/).filter(Boolean);
  if (code === text || names.includes(text)) return 0;
  if (code.startsWith(text)) return 1;
  if (text.length < 3) return null;
  const words = `${code} ${names.join(" ")}`.split(/[^a-z0-9']+/);
  if (words.some((w) => w.startsWith(text))) return 2;
  // From three letters, anywhere: musculus finds Mus musculus.
  return `${code} ${s.name ?? ""}`.toLowerCase().includes(text) ? 3 : null;
}

// The names shown for this text, at most SHOWN. An empty box matches every
// code, so focusing it shows the first few.
export function namesFor(all, text) {
  const want = text.trim().toLowerCase();
  return all.map((s, i) => [rank(s, want), i, s])
            .filter(([r]) => r !== null)
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
            .slice(0, SHOWN)
            .map(([, , s]) => s);
}

// Focused or typed in: drawn for the box as it is now. Typing starts the
// arrows again from the box.
export const drawn = (list, text, typed) => ({ text, open: true, active: typed ? -1 : list.active });
export const closed = (list) => ({ ...list, open: false, active: -1 });
// An arrow: round and round the names shown.
export const stepped = (list, text, key, count) =>
  ({ text, open: true, active: (list.active + (key === "ArrowDown" ? 1 : -1) + count) % count });
