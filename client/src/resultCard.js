// What one result card says, worked out from an /api/entries result
// (public/app.js card_html). Plain data; ResultCard only draws it.
import { number } from "./format.js";

// The long PDB method names, as the short labels shown on each result.
export const METHOD_LABELS = {
  "X-RAY DIFFRACTION": "X-ray",
  "ELECTRON MICROSCOPY": "EM",
  "SOLID-STATE NMR": "Solid NMR",
  "SOLUTION NMR": "NMR",
  "NEUTRON DIFFRACTION": "Neutron",
  "ELECTRON CRYSTALLOGRAPHY": "Electron cryst.",
  "POWDER DIFFRACTION": "Powder",
  "FIBER DIFFRACTION": "Fiber",
  "SOLUTION SCATTERING": "Scattering",
  "EPR": "EPR",
  "FLUORESCENCE TRANSFER": "FRET",
  "INFRARED SPECTROSCOPY": "IR",
  "THEORETICAL MODEL": "Model",
};

export const methodLabel = (method) => METHOD_LABELS[method] || method;
export const resolutionText = (r) => (r == null ? null : Number(r).toFixed(2) + " Å");
export const yearOf = (date) => (date ? String(date).slice(0, 4) : "");

// Fields the card's head already says, so they are not repeated below it.
const CARD_HEAD = new Set(["title", "method", "deposition_date", "resolution", "polymer_type"]);

export function cardParts(entry) {
  const a = entry.arcs;
  const method = methodLabel(entry.method);
  const resolution = resolutionText(entry.resolution);
  const year = yearOf(entry.deposition_date);

  // value: text, or { n, wc } for the base pairs, whose WC count is set small.
  const facts = [
    ["Method", [method, resolution].filter(Boolean).join(" · ")],
    ["Deposited", year || null],
    ["Nucleotides", a ? number(a.nucleotides) : null],
    ["Base pairs", a ? { n: number(a.pairs), wc: number(a.wc) } : "None annotated"],
    ["Modified", a ? number(a.modified) : null],
    ["Strands", a ? number(a.strands) : null],
  ].filter(([, value]) => value);

  // The phone card's short forms: first author, paper and organisms on one
  // line, the modified residues as chips; the full fields wait behind More.
  const field = (key) => entry.card.find((row) => row.key === key)?.value ?? "";
  const authors = field("all_authors").split(/,\s*(?=[^,]+,)/);
  const first = authors[0] ? authors[0].replace(/,\s*/, " ").replace(/\.$/, "") + (authors.length > 1 ? " et al." : "") : "";
  const brief = [first, field("published"), field("source_organism").replace(/;\s*/g, ", ")].filter(Boolean).join(" · ");
  const residues = field("nonstandard_residue").split(/,\s*/).filter(Boolean);
  const ligands = field("ligands").split(/,\s*/).filter(Boolean).length;
  const nums = a ? [["nt", a.nucleotides], ["pairs", a.pairs], ["WC", a.wc], ["modified", a.modified]] : [];

  return {
    when: [[method, resolution].filter(Boolean).join(" "), year].filter(Boolean).join(" · "),
    facts,
    nums: nums.map(([label, n]) => [label, number(n)]),
    brief,
    residues,
    ligandChip: ligands ? `+${ligands} ligand${ligands === 1 ? "" : "s"}` : "",
    rows: entry.card.filter((row) => !CARD_HEAD.has(row.key) || row.searched),
  };
}
