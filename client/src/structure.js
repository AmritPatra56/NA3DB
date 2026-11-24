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
