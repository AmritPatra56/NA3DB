export const SHOWN = 8;
export const CLOSED = { text: null, open: false, active: -1 };

// Best match first, as UniProt's taxonomy suggester: "human" puts Homo sapiens above Human adenovirus 2.
function rank(s, text) {
  const code = s.code.toLowerCase();
  const names = (s.name ?? "").toLowerCase().split(/,\s*/).filter(Boolean);
  if (code === text || names.includes(text)) return 0;
  if (code.startsWith(text)) return 1;
  if (text.length < 3) return null;
  const words = `${code} ${names.join(" ")}`.split(/[^a-z0-9']+/);
  if (words.some((w) => w.startsWith(text))) return 2;
  return `${code} ${s.name ?? ""}`.toLowerCase().includes(text) ? 3 : null;
}

export function namesFor(all, text) {
  const want = text.trim().toLowerCase();
  return all.map((s, i) => [rank(s, want), i, s])
            .filter(([r]) => r !== null)
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
            .slice(0, SHOWN)
            .map(([, , s]) => s);
}

export const drawn = (list, text, typed) => ({ text, open: true, active: typed ? -1 : list.active });
export const closed = (list) => ({ ...list, open: false, active: -1 });
export const stepped = (list, text, key, count) =>
  ({ text, open: true, active: (list.active + (key === "ArrowDown" ? 1 : -1) + count) % count });
