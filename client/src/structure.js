// What the structure page shows where (detail.js), shared by Structure,
// Section and SectionNav.

// Rows the page shows another way (detail.js SHOWN_ELSEWHERE), and the rows
// that sit under Conformation rather than Overview.
export const SHOWN_ELSEWHERE = new Set(["nonstandard_residue", "monomer_flag", "ligands", "assigned_ntc", "ntc_classes"]);
export const CONFORMATION = new Set(["confal_score", "confal_percentile", "ntc_step_count"]);
// detail.js NUCLEIC_KINDS: the Views draw only these chains.
export const NUCLEIC_KINDS = new Set(["RNA", "DNA", "DNA/RNA hybrid"]);

// detail.js PAGE_GROUPS: the nav's groups, in page order.
export const PAGE_GROUPS = [
  { key: "views", label: "Views" },
  { key: "overview", label: "Overview" },
  { key: "composition", label: "Composition" },
  { key: "structure", label: "Structure" },
  { key: "references", label: "References" },
];

// The molecule groups split by the section that lists them (detail.js
// structure_sections): polymers under Molecules, then the modified
// nucleotides and the ligands, each with a section of its own.
export function groupsBySection(molecules) {
  const groups = molecules.groups;
  return {
    molecules: groups.filter((g) => g.polymer),
    "modified-nucleotides": groups.filter((g) => g.modified),
    ligands: groups.filter((g) => !g.polymer && !g.modified),
  };
}

// How many rows a section's groups hold together; none makes it empty.
export const rowCount = (groups) => groups.reduce((n, g) => n + g.rows.length, 0);

// A group's anchor inside its section: "molecules-dna-rna-hybrid".
export const groupAnchor = (sectionId, kind) => `${sectionId}-${kind.toLowerCase().replace(/[^a-z]+/g, "-")}`;

// The colour class of a source kind: "Expressed" becomes "source_expressed"
// (structure.ejs changes the first space only).
export const sourceClass = (kind) => `source_${kind.toLowerCase().replace(" ", "_")}`;

// The arc key's kinds, in the order structure.ejs lists them.
export const ARC_KINDS = [["wc", "cWW Watson–Crick"], ["gu", "cWW G–U"], ["nc", "Others"]];

// Where a strand's name sits under the picture: halfway along, to 0.1.
export const strandMiddle = (chain) => Math.round((chain.x1 + chain.x2) * 5) / 10;
