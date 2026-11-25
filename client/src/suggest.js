// The search box's name list (box_suggest.js), as plain data and functions.

export const GROUP_LABELS = { entries: "Entries", authors: "Authors", organisms: "Organisms",
                              residues: "Modified residues", ligands: "Ligands", molecules: "Molecules" };

// The list's id, and each option's, as box_suggest.js names them from the box's name (q).
export const LIST_ID = "q_box_options";
export const optionId = (i) => `${LIST_ID}_${i}`;

// Where the typed text starts a word of the name, cut in three so the middle
// can be bold: ["Homo ", "sap", "iens"]. Not found: the name whole.
export function marked(label, text) {
  const lower = label.toLowerCase(), want = text.toLowerCase();
  let at = lower.indexOf(want);
  while (at > 0 && /[a-z0-9]/i.test(lower[at - 1])) at = lower.indexOf(want, at + 1);
  if (at < 0) return [label];
  return [label.slice(0, at), label.slice(at, at + want.length), label.slice(at + want.length)];
}

// The option the arrow keys move to. Past either end is back in the box (-1).
export function nextActive(key, active, count) {
  const step = key === "ArrowDown" ? 1 : -1;
  const next = active === -1 ? (step === 1 ? 0 : count - 1) : active + step;
  return next >= count || next < 0 ? -1 : next;
}
