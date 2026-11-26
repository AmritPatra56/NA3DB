// The report's files as text (public/report.js build_csv, fasta_text,
// readme_text), and handing one to the browser to save. No server involved.

// One value as a CSV cell: a comma, quote or line break means the whole cell
// is quoted, and a quote inside it is written twice.
function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return '"' + text.replaceAll('"', '""') + '"';
  }
  return text;
}

// The whole file: a header row of labels, then one row per row. Starts with a
// byte-order mark, without which Excel reads UTF-8 as Latin-1 and an author
// like Ferré-D'Amaré comes out garbled.
export function buildCsv(fields, rows) {
  const header = fields.map((f) => csvCell(f.label)).join(",");
  const lines = rows.map((row) => fields.map((f) => csvCell(row[f.key])).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

// Today as the file names write it: 2026-11-26.
export const today = () => new Date().toISOString().slice(0, 10);

// PDB ids Excel turns into numbers: 3E42 becomes 3 x 10^42 and stays so.
const EXCEL_NUMBER = /^\d+E\d+$/i;
export const excelIds = (ids) => ids.filter((id) => EXCEL_NUMBER.test(id));

// FASTA in the header layout of the structure page and RCSB:
// >1OB5_2|Chains B, D, F|TRANSFER-RNA, PHE|Saccharomyces cerevisiae (4932).
export function fastaText(molecules) {
  return molecules.filter((m) => m.sequence).map((m) => {
    const chains = String(m.chains || "").split(", ").filter(Boolean);
    const organism = m.organism && !m.organism.includes(";") && m.taxonomy_id && !String(m.taxonomy_id).includes(";")
      ? `${m.organism} (${m.taxonomy_id})`
      : m.organism;
    const header = [`${m.pdb_id}_${m.molecule_id}`,
                    chains.length ? `${chains.length === 1 ? "Chain" : "Chains"} ${chains.join(", ")}` : "",
                    m.molecule_name || "", organism || ""].filter(Boolean).join("|");
    return `>${header}\n${m.sequence.match(/.{1,80}/g).join("\n")}\n`;
  }).join("");
}

// README.txt. origin: the site's; search: the search's query string;
// proteins, water: the options on; counts: rows per table; dbn: the
// /api/export/dbn reply; excel: the ids Excel would spoil; date: today.
export function readmeText({ origin, search, proteins, water, counts, dbn, excel, date }) {
  const lines = [
    "NA3DB report",
    "",
    `Downloaded: ${date}`,
    `Search: ${origin}/search?${search}`,
    "",
    "Files",
    `  structures.csv   one row per structure (${counts.structures})`,
    `  molecules.csv    one row per molecule in a structure (${counts.molecules}), ` +
      (proteins ? "proteins included" : "nucleic acids only"),
    `  ligands.csv      one row per ligand in a structure (${counts.ligands}), ` +
      (water ? "water included" : "water left out"),
    "  sequences.fasta  the sequences of the molecules in molecules.csv",
    `  base_pairs.dbn   dot-bracket, one record per structure (${dbn.records})`,
    "",
    "Entry ID is in every table: join on it to put them together.",
    "",
    "Counts (chains, copies, nucleotides) describe the deposited model, the",
    "asymmetric unit, not the biological assembly.",
    "",
    "Sequences are the full sequences studied, residues missing from the model",
    "included, each modified residue written as its parent (PSU as U).",
    "",
    "base_pairs.dbn",
    "  Each record: >Entry ID|chains, the sequence, then the structure.",
    "  Chains are joined by &, in the same order in both lines.",
    "  Pairs: canonical cWW only (A-U, G-C, G-U; a modified base counts as its",
    "  parent), within the chains of the file, first model. Pairs with a",
    "  symmetry copy are left out. Crossing pairs (pseudoknots) use [] then {}.",
    "  Other pair families are on each structure's page, as a layered map.",
  ];
  if (dbn.unannotated.length) lines.push("  No base-pair annotation yet, so no record: " + dbn.unannotated.join(" "));
  lines.push("", "Excel",
    "  Excel reads some PDB ids as numbers (3E42 becomes 3.00E+42) and the",
    "  change cannot be undone after saving. Import with Data > From Text/CSV",
    "  and set Entry ID to Text instead of opening the file directly.");
  if (excel.length) lines.push("  Ids in this download that are affected: " + excel.join(" "));
  lines.push("", "How to cite: " + origin + "/cite", "");
  return lines.join("\r\n");
}

// Hands the browser a file to save.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
