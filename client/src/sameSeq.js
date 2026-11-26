// The Same sequence table as data (public/sameseq.js entry_rows, draw_group):
// for a group from /api/entries/:id/same_sequence, the entries in the order
// the table lists them and the words around them. Pure, so the components
// only draw what this says. Numbers stay as sameseq.js writes them (no
// thousands separator), so both pages read the same.

export const ROWS_SHOWN = 10;        // entries listed before "Show all"
export const VERDICT_ICON = { same: "✓", same_fold: "≈", different_fold: "≠", no_pairs: "•" };
export const BEST_NOTE = "Best resolution, then the most confident backbone, then the most nucleotides modelled";

export const resolution = (r) => (r === null || r === undefined ? null : `${Number(r).toFixed(r < 10 ? 2 : 1)} Å`);
export const methodShort = (m) => String(m ?? "").replace(/ DIFFRACTION$/, "").replace(/^SOLUTION /, "").toLowerCase() || "unknown method";

// This page first, then the best resolution, then by id.
export const sortedEntries = (group) => [...group.entries].sort((x, y) =>
  (y.this - x.this) || ((x.resolution ?? Infinity) - (y.resolution ?? Infinity)) || x.entry.localeCompare(y.entry));

export const refName = (group) => group.entries.flatMap((e) => e.chains).find((c) => c.id === group.ref).name;

// The line over a group's table; with several groups it starts with the kind.
export function leadText(group, many) {
  const others = group.entries.filter((e) => !e.this).length;
  return {
    head: many ? `${group.kind}, ${group.length} nt.` : null,
    text: `${others === 1 ? "1 other entry has" : `${others} other entries have`} ${group.kind === "RNA" ? "an" : "a"} ${group.kind} chain with exactly the sequence of ${refName(group)}, ${group.length} nt.`,
  };
}

export const modelled = (c) => (c.seen === c.length ? `all ${c.length} nt modelled` : `${c.seen} of ${c.length} nt modelled`)
  + (c.confal === null ? "" : ` · confal ${c.confal}`);
