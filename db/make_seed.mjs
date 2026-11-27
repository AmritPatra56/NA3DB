// Writes db/seed.sql (test fixture) from entries.json. Run: node db/make_seed.mjs

import entries from "../entries.json" with { type: "json" };
import { writeFileSync } from "node:fs";

function q(value) {
    if (value === null || value === undefined || value === "") return "NULL";
    return "'" + String(value).replaceAll("'", "''") + "'";
}

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

const TAXA = {
    "Saccharomyces cerevisiae": 4932, "Escherichia coli": 562, "Homo sapiens": 9606,
    "synthetic construct": 32630, "Oryctolagus cuniculus": 9986, "Mycobacterium tuberculosis": 1773
};

let body = [];
let chem_comps = new Map();          // code → 'y' or 'n', collected as we go

const NONPOLY = { MG: "MAGNESIUM ION", ZN: "ZINC ION", K: "POTASSIUM ION", HOH: "WATER" };
let xray = 0;                        // X-ray entries seen so far

entries.forEach((e, n) => {
    const id = q(e.pdb_id);

    body.push(`INSERT INTO entry (id) VALUES (${id});`);
    body.push(`INSERT INTO struct (entry_id, title) VALUES (${id}, ${q(e.title)});`);
    body.push(`INSERT INTO exptl (entry_id, method) VALUES (${id}, ${q(e.method)});`);

    if (e.resolution !== null && e.method === "ELECTRON MICROSCOPY") {
        body.push(`INSERT INTO em_3d_reconstruction (entry_id, id, image_processing_id, resolution, resolution_method)`
                + ` VALUES (${id}, '1', '1', ${e.resolution}, 'FSC 0.143 CUT-OFF');`);
    } else if (e.resolution !== null) {
        body.push(`INSERT INTO reflns (entry_id, d_resolution_high) VALUES (${id}, ${e.resolution});`);
    }

    body.push(`INSERT INTO pdbx_database_status (entry_id, recvd_initial_deposition_date)`
            + ` VALUES (${id}, ${q(e.deposition_date)});`);

    body.push(`INSERT INTO citation (id, entry_id) VALUES ('primary', ${id});`);
    body.push(`INSERT INTO citation_author (entry_id, citation_id, name, ordinal)`
            + ` VALUES (${id}, 'primary', ${q(e.author)}, 1);`);

    const types = POLYMER_TYPES[e.polymer_type] || ["other"];

    types.forEach((type, i) => {
        const ent = q(String(i + 1));
        body.push(`INSERT INTO entity (id, entry_id, type, pdbx_description)`
                + ` VALUES (${ent}, ${id}, 'polymer', ${q(e.entity_name)});`);
        body.push(`INSERT INTO entity_poly (entity_id, entry_id, type)`
                + ` VALUES (${ent}, ${id}, ${q(type)});`);
    });

    // Fixture data, not PDB data: source kinds follow a fixed rule so the tests get all three.
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

    let residues = [["A", "y"]];

    if (e.nonstandard_residue) {
        for (const code of e.nonstandard_residue.split(",").map((s) => s.trim()).filter(Boolean)) {
            residues.push([code, "n"]);
        }
    }

    const na = q(String(Math.max(0, types.findIndex((t) => t.includes("nucleotide"))) + 1));

    residues.forEach(([code, flag], i) => {
        chem_comps.set(code, flag);
        body.push(`INSERT INTO entity_poly_seq (entity_id, entry_id, num, mon_id)`
                + ` VALUES (${na}, ${id}, ${i + 1}, ${q(code)});`);
    });

    // Fixture data: water on three of four X-ray entries, ions by position.
    let nonpoly = [];
    if (n % 3 === 0)  nonpoly.push(["MG", 1 + n % 4]);
    if (n % 7 === 0)  nonpoly.push(["ZN", 1]);
    if (n % 11 === 0) nonpoly.push(["K", 2]);
    if (e.method === "X-RAY DIFFRACTION" && xray++ % 4 !== 3) nonpoly.push(["HOH", 10 + (n * 37) % 300]);

    nonpoly.forEach(([code, copies], i) => {
        const ent = q(String(types.length + i + 1));
        const kind = code === "HOH" ? "water" : "non-polymer";
        const name = code === "HOH" ? "water" : NONPOLY[code];
        body.push(`INSERT INTO entity (id, entry_id, type, pdbx_description, pdbx_number_of_molecules)`
                + ` VALUES (${ent}, ${id}, '${kind}', ${q(name)}, ${copies});`);
        body.push(`INSERT INTO pdbx_entity_nonpoly (entity_id, entry_id, name, comp_id)`
                + ` VALUES (${ent}, ${id}, ${q(name)}, ${q(code)});`);
    });
});

const comps = [...chem_comps].map(([code, flag]) =>
    `INSERT INTO chem_comp (id, name, mon_nstd_flag)`
  + ` VALUES (${q(code)}, NULL, ${q(flag)}) ON CONFLICT (id) DO NOTHING;`)
  .concat(Object.entries(NONPOLY).map(([code, name]) =>
    `INSERT INTO chem_comp (id, name) VALUES (${q(code)}, ${q(name)}) ON CONFLICT (id) DO NOTHING;`));

// doc is created empty by the migrations; only a load fills it.
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

// Migrations compute the monomer flag once, so a later seed must too.
const flag = `UPDATE entry e SET has_nonstandard_residue = EXISTS (
    SELECT 1 FROM entity_poly_seq eps
    JOIN entity_poly ep ON ep.entry_id = eps.entry_id AND ep.entity_id = eps.entity_id
    JOIN chem_comp cc ON cc.id = eps.mon_id
    WHERE eps.entry_id = e.id AND ep.type ILIKE '%nucleotide%' AND cc.mon_nstd_flag = 'n');`;

const sql = ["BEGIN;", ...comps, ...body, flag, "COMMIT;", refresh].join("\n") + "\n";

writeFileSync(new URL("./seed.sql", import.meta.url), sql);
console.log(`wrote db/seed.sql: ${entries.length} entries, ${chem_comps.size} residue codes`);
