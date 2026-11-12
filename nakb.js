// nakb.js - the molecules on the front page, as NAKB labels them.
//
// Title words got these wrong both ways: "ribosome" missed 89 entries titled
// "ribosomal subunit" and took in the HCV "Internal Ribosome Entry Site". So
// an entry is a tRNA or a nucleosome because the Nucleic Acid Knowledgebase
// says so (db/fetch_nakb.mjs writes nakb.json). Only molecules whose NAKB
// labels agreed with an independent method on our 1,489 entries are here:
//
//   Nucleosome  100%  four or more histone chains (Pfam PF00125, SIFTS)
//   Ribosome     97%  Rfam rRNA or ribosomal-protein Pfam families
//   tRNA         88%  Rfam tRNA families
//   Quadruplex   84%  DSSR G4DB
//   Riboswitch   79%  Rfam riboswitch families
//
// Nearly every disagreement was the other method's gap: Rfam misses an
// anticodon stem-loop, G4DB a quadruplex without G-tetrads. CRISPR (58%),
// ribozyme (62%) and aptamer (no independent method) were left out, and
// Z-DNA (82%, but only 11 entries) was taken off by choice.

import { readFileSync } from "node:fs";

// list: NAKB's nucleic acid ("na") or protein ("prot") labels. term: the
// label, exactly as NAKB writes it.
export const NAKB_TOPICS = [
    { value: "tRNA",       nakb: { list: "na",   term: "transfer RNA" },        note: "carries amino acids" },
    { value: "Ribosome",   nakb: { list: "prot", term: "ribosome" },            note: "makes proteins" },
    { value: "Nucleosome", nakb: { list: "prot", term: "nucleosome" },          note: "DNA wrapped on histones" },
    { value: "Quadruplex", nakb: { list: "na",   term: "quadruplex" },          note: "four-stranded" },
    { value: "Riboswitch", nakb: { list: "na",   term: "riboswitch" },          note: "RNA that senses a molecule" }
];

export const NAKB_SOURCE = "https://www.nakb.org/";

let labelled = null;

// The PDB ids, upper case, NAKB labels as any of the chosen molecules. An
// unknown molecule adds none, so it matches nothing rather than everything.
export function topic_ids(values) {
    labelled ??= JSON.parse(readFileSync(new URL("./nakb.json", import.meta.url), "utf8")).topics;
    return [...new Set(values.flatMap((v) => labelled[v] ?? []))];
}
