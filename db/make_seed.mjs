// make_seed.mjs - turns the flat entries.json into SQL for the real schema.
// Run:  node db/make_seed.mjs     →  writes db/seed.sql
//
// entries.json holds one object per structure. The real schema spreads that
// same information across ten tables, so one object becomes eleven INSERTs.

import entries from "../entries.json" with { type: "json" };
import { writeFileSync } from "node:fs";

// One value as a SQL literal. A quote inside the text is doubled, which is
// how SQL escapes it. Empty or missing becomes NULL, not an empty string.
function q(value) {
    if (value === null || value === undefined || value === "") return "NULL";
    return "'" + String(value).replaceAll("'", "''") + "'";
}

// One flat polymer_type becomes one or more entity_poly.type values.
// "Protein/NA" is TWO polymers in one structure, so it becomes two entities.
const POLYMER_TYPES = {
    "Nucleic acid":            ["polyribonucleotide"],
    "Protein/NA":              ["polypeptide(L)", "polyribonucleotide"],
    "Protein":                 ["polypeptide(L)"],
    "Oligosaccharide":         ["polysaccharide(D)"],
    "Protein/Oligosaccharide": ["polypeptide(L)", "polysaccharide(D)"],
    "Other":                   ["other"]
};

let body = [];
let chem_comps = new Map();          // code → 'y' or 'n', collected as we go

for (const e of entries) {
    const id = q(e.pdb_id);

    body.push(`INSERT INTO entry (id) VALUES (${id});`);
    body.push(`INSERT INTO struct (entry_id, title) VALUES (${id}, ${q(e.title)});`);
    body.push(`INSERT INTO exptl (entry_id, method) VALUES (${id}, ${q(e.method)});`);

    if (e.resolution !== null) {
        body.push(`INSERT INTO reflns (entry_id, d_resolution_high) VALUES (${id}, ${e.resolution});`);
    }

    body.push(`INSERT INTO pdbx_database_status (entry_id, recvd_initial_deposition_date)`
            + ` VALUES (${id}, ${q(e.deposition_date)});`);

    // citation first, because citation_author's foreign key points at it
    body.push(`INSERT INTO citation (id, entry_id) VALUES ('primary', ${id});`);
    body.push(`INSERT INTO citation_author (entry_id, citation_id, name, ordinal)`
            + ` VALUES (${id}, 'primary', ${q(e.author)}, 1);`);

    // one entity per polymer type this structure contains
    const types = POLYMER_TYPES[e.polymer_type] || ["other"];

    types.forEach((type, i) => {
        const ent = q(String(i + 1));
        body.push(`INSERT INTO entity (id, entry_id, type, pdbx_description)`
                + ` VALUES (${ent}, ${id}, 'polymer', ${q(e.entity_name)});`);
        body.push(`INSERT INTO entity_poly (entity_id, entry_id, type)`
                + ` VALUES (${ent}, ${id}, ${q(type)});`);
    });

    if (e.source_organism) {
        body.push(`INSERT INTO entity_src_gen (entity_id, entry_id, pdbx_gene_src_scientific_name)`
                + ` VALUES ('1', ${id}, ${q(e.source_organism)});`);
    }

    // Residues. Every entry gets one ordinary residue. An entry that lists
    // non-standard ones gets a row for each, flagged 'n', which is what
    // makes it "Non-Standard". There is no monomer_flag column anywhere.
    let residues = [["A", "y"]];

    if (e.nonstandard_residue) {
        for (const code of e.nonstandard_residue.split(",").map((s) => s.trim()).filter(Boolean)) {
            residues.push([code, "n"]);
        }
    }

    residues.forEach(([code, flag], i) => {
        chem_comps.set(code, flag);
        body.push(`INSERT INTO entity_poly_seq (entity_id, entry_id, num, mon_id)`
                + ` VALUES ('1', ${id}, ${i + 1}, ${q(code)});`);
    });
}

// chem_comp is global: one row per residue code, shared by every entry using
// it. name is NULL because entries.json has codes and no chemical names, which
// also lets a test tell "search the code" from "search the name".
const comps = [...chem_comps].map(([code, flag]) =>
    `INSERT INTO chem_comp (id, name, mon_nstd_flag)`
  + ` VALUES (${q(code)}, NULL, ${q(flag)}) ON CONFLICT (id) DO NOTHING;`);

const sql = ["BEGIN;", ...comps, ...body, "COMMIT;"].join("\n") + "\n";

writeFileSync(new URL("./seed.sql", import.meta.url), sql);
console.log(`wrote db/seed.sql: ${entries.length} entries, ${chem_comps.size} residue codes`);
