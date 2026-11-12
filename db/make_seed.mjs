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
// "Protein/RNA" is TWO polymers in one structure, so it becomes two entities.
const POLYMER_TYPES = {
    "RNA":                     ["polyribonucleotide"],
    "DNA":                     ["polydeoxyribonucleotide"],
    "DNA/RNA":                 ["polydeoxyribonucleotide", "polyribonucleotide"],
    "Protein/RNA":             ["polypeptide(L)", "polyribonucleotide"],
    "Protein/DNA":             ["polypeptide(L)", "polydeoxyribonucleotide"],
    "Protein/DNA/RNA":         ["polypeptide(L)", "polydeoxyribonucleotide", "polyribonucleotide"],
    "Protein":                 ["polypeptide(L)"],
    "Oligosaccharide":         ["polysaccharide(D)"],
    "Protein/Oligosaccharide": ["polypeptide(L)", "polysaccharide(D)"],
    "Other":                   ["other"]
};

// NCBI taxonomy IDs for the organisms entries.json names; the rest stay NULL.
const TAXA = {
    "Saccharomyces cerevisiae": 4932, "Escherichia coli": 562, "Homo sapiens": 9606,
    "synthetic construct": 32630, "Oryctolagus cuniculus": 9986, "Mycobacterium tuberculosis": 1773
};

let body = [];
let chem_comps = new Map();          // code → 'y' or 'n', collected as we go

for (const e of entries) {
    const id = q(e.pdb_id);

    body.push(`INSERT INTO entry (id) VALUES (${id});`);
    body.push(`INSERT INTO struct (entry_id, title) VALUES (${id}, ${q(e.title)});`);
    body.push(`INSERT INTO exptl (entry_id, method) VALUES (${id}, ${q(e.method)});`);

    // Where the PDB keeps it: an EM map's resolution in em_3d_reconstruction
    // (migration 015), a diffraction limit in reflns.
    if (e.resolution !== null && e.method === "ELECTRON MICROSCOPY") {
        body.push(`INSERT INTO em_3d_reconstruction (entry_id, id, image_processing_id, resolution, resolution_method)`
                + ` VALUES (${id}, '1', '1', ${e.resolution}, 'FSC 0.143 CUT-OFF');`);
    } else if (e.resolution !== null) {
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

    // Sources. entries.json has one organism name and no source kind, and only
    // 2 of its 120 IDs are in the real database, so the kind is made up by a
    // fixed rule to give the tests all three. This is fixture data, not PDB data:
    //   RNA with an organism      → natural (purified), entity 1
    //   RNA without one           → synthetic construct, 32630, entity 1
    //   Protein/RNA               → entity 1 (protein) expressed in E. coli 562;
    //                               the RNA entity is left with no source
    const taxid = TAXA[e.source_organism] ?? "NULL";
    if (e.polymer_type === "RNA" && e.source_organism) {
        body.push(`INSERT INTO entity_src_nat (entity_id, entry_id, pdbx_organism_scientific, pdbx_ncbi_taxonomy_id)`
                + ` VALUES ('1', ${id}, ${q(e.source_organism)}, ${taxid});`);
    } else if (e.polymer_type === "RNA") {
        body.push(`INSERT INTO pdbx_entity_src_syn (entity_id, entry_id, organism_scientific, ncbi_taxonomy_id)`
                + ` VALUES ('1', ${id}, 'synthetic construct', 32630);`);
    } else if (e.source_organism) {
        body.push(`INSERT INTO entity_src_gen (entity_id, entry_id, pdbx_gene_src_scientific_name,`
                + ` pdbx_gene_src_ncbi_taxonomy_id, pdbx_host_org_scientific_name, pdbx_host_org_ncbi_taxonomy_id)`
                + ` VALUES ('1', ${id}, ${q(e.source_organism)}, ${taxid}, 'Escherichia coli', 562);`);
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

    // On the nucleic acid entity: modified nucleotides on a protein would be
    // counted as protein modifications, which the monomer flag leaves out.
    const na = q(String(Math.max(0, types.findIndex((t) => t.includes("nucleotide"))) + 1));

    residues.forEach(([code, flag], i) => {
        chem_comps.set(code, flag);
        body.push(`INSERT INTO entity_poly_seq (entity_id, entry_id, num, mon_id)`
                + ` VALUES (${na}, ${id}, ${i + 1}, ${q(code)});`);
    });
}

// chem_comp is global: one row per residue code, shared by every entry using
// it. name is NULL because entries.json has codes and no chemical names, which
// also lets a test tell "search the code" from "search the name".
const comps = [...chem_comps].map(([code, flag]) =>
    `INSERT INTO chem_comp (id, name, mon_nstd_flag)`
  + ` VALUES (${q(code)}, NULL, ${q(flag)}) ON CONFLICT (id) DO NOTHING;`);

// Rebuilding doc is part of loading data, not part of the schema: the view
// is created empty when the migrations run and only this fills it.
const refresh = `
-- The search box reads the doc materialized view, which is a copy built when
-- the schema is. Data loaded afterwards is invisible to it until it is
-- rebuilt, which would leave the filters working and the box finding nothing.
-- Guarded so this file still runs against a schema that predates the view.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = 'doc' AND c.relkind = 'm' AND n.nspname = 'public') THEN
        REFRESH MATERIALIZED VIEW doc;
    END IF;
END $$;
`;

// The monomer flag is stored on entry and derived from the residues (see
// migration 010). Migrations compute it once, so a seed loaded after them
// must compute it too, or every entry reads as standard.
const flag = `UPDATE entry e SET has_nonstandard_residue = EXISTS (
    SELECT 1 FROM entity_poly_seq eps
    JOIN entity_poly ep ON ep.entry_id = eps.entry_id AND ep.entity_id = eps.entity_id
    JOIN chem_comp cc ON cc.id = eps.mon_id
    WHERE eps.entry_id = e.id AND ep.type ILIKE '%nucleotide%' AND cc.mon_nstd_flag = 'n');`;

const sql = ["BEGIN;", ...comps, ...body, flag, "COMMIT;", refresh].join("\n") + "\n";

writeFileSync(new URL("./seed.sql", import.meta.url), sql);
console.log(`wrote db/seed.sql: ${entries.length} entries, ${chem_comps.size} residue codes`);
