export const SHOWN_ELSEWHERE = new Set(["nonstandard_residue", "monomer_flag", "ligands", "assigned_ntc", "ntc_classes"]);
export const CONFORMATION = new Set(["confal_score", "confal_percentile", "ntc_step_count"]);
export const NUCLEIC_KINDS = new Set(["RNA", "DNA", "DNA/RNA hybrid"]);

export const PAGE_GROUPS = [
  { key: "views", label: "Views" },
  { key: "overview", label: "Overview" },
  { key: "composition", label: "Composition" },
  { key: "structure", label: "Structure" },
  { key: "references", label: "References" },
];

export function groupsBySection(molecules) {
  const groups = molecules.groups;
  return {
    molecules: groups.filter((g) => g.polymer),
    "modified-nucleotides": groups.filter((g) => g.modified),
    ligands: groups.filter((g) => !g.polymer && !g.modified),
  };
}

export const rowCount = (groups) => groups.reduce((n, g) => n + g.rows.length, 0);

export const groupAnchor = (sectionId, kind) => `${sectionId}-${kind.toLowerCase().replace(/[^a-z]+/g, "-")}`;

export const sourceClass = (kind) => `source_${kind.toLowerCase().replace(" ", "_")}`;

export const ARC_KINDS = [["wc", "cWW Watson–Crick"], ["gu", "cWW G–U"], ["nc", "Others"]];

export const strandMiddle = (chain) => Math.round((chain.x1 + chain.x2) * 5) / 10;
