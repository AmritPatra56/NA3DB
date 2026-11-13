// report.test.js - the report's tables: which fields each holds, what the
// export returns for Structures, and how /report opens a table.

import test, { before, after } from "node:test";
import assert from "node:assert";
import { once } from "node:events";
import { COLUMNS, REPORT_TABLES, REPORT_KEY, report_fields, public_registry, LIGAND_COLUMNS } from "./filters.js";
import { export_entries, export_molecules, export_ligands, export_dot_brackets } from "./search.js";
import { dot_bracket_record } from "./detail.js";
import app, { asked_table } from "./server.js";
import { close, query, transaction } from "./db.js";

let base;
let server;

before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    base = `http://localhost:${server.address().port}`;
});

after(async () => {
    server.close();
    await close();
});

const structures = REPORT_TABLES.find((t) => t.key === "structures");

// Fields about a part of a structure: one value per molecule or ligand, so
// they belong in Molecules or Ligands, never beside the paper.
const PART_FIELDS = ["entity_name", "source_organism", "source_taxonomy", "source_kind",
                     "expression_host", "nonstandard_residue", "ligands", "assigned_ntc"];


// --- the tables ---------------------------------------------------------

test("the report has Structures, Molecules and Ligands, Structures first", () => {
    assert.deepEqual(REPORT_TABLES.map((t) => t.name), ["Structures", "Molecules", "Ligands"]);
});

test("every report field is a registry column, in one table only, starting with Entry ID", () => {
    let seen = new Set();

    for (const table of REPORT_TABLES) {
        let keys = report_fields(table).map((f) => f.key);

        if (keys.length) assert.equal(keys[0], REPORT_KEY, `${table.name} must start with Entry ID`);
        for (const key of keys) {
            assert.ok((table.columns ?? COLUMNS).some((c) => c.key === key), `${key} is not a column`);
            assert.ok(!seen.has(key) || key === REPORT_KEY, `${key} is in two tables`);
            seen.add(key);
        }
    }
});

test("Structures holds no field about a single molecule or ligand", () => {
    let keys = report_fields(structures).map((f) => f.key);

    for (const key of PART_FIELDS) assert.ok(!keys.includes(key), `${key} is in Structures`);
});

test("defaults are fields of their own table", () => {
    for (const table of REPORT_TABLES) {
        let keys = report_fields(table).map((f) => f.key);
        for (const key of table.defaults ?? []) assert.ok(keys.includes(key), `${table.name}: ${key}`);
    }
});

test("the page gets the tables with labels and no SQL", () => {
    let sent = JSON.stringify(public_registry().report_tables);

    assert.ok(!/SELECT/i.test(sent));
    assert.ok(sent.includes('"label":"First author"'));
    assert.equal(public_registry().report_key, "pdb_id");
});


// --- what the export returns -------------------------------------------

test("the export returns exactly the Structures fields, in table order", async () => {
    let row = (await export_entries({})).results[0];

    assert.deepEqual(Object.keys(row), report_fields(structures).map((f) => f.key));
});

// Runs work inside a transaction that is always rolled back, so rows it
// inserts never reach the test database.
const ROLLBACK = new Error("rollback");
async function rolled_back(work) {
    let result;
    try {
        await transaction(async (q) => { result = await work(q); throw ROLLBACK; });
    } catch (err) {
        if (err !== ROLLBACK) throw err;
    }
    return result;
}

const value_of = async (q, key, id) => {
    let c = COLUMNS.find((col) => col.key === key);
    return (await q(`SELECT ${c.report_select ?? c.select} AS v FROM entry e WHERE e.id = $1`, [id])).rows[0].v;
};

// The test database has no chains, so a small entry of its own: protein,
// RNA in two copies with a line break in its sequence, DNA, and a hybrid.
// Checked against the page's count on all 1,489 real entries as well.
test("the report's nucleotide count: nucleic acids only, every copy, line breaks ignored", async () => {
    let n = await rolled_back(async (q) => {
        await q(`INSERT INTO entry (id) VALUES ('ZZ09')`);
        await q(`INSERT INTO entity (id, entry_id, type) VALUES
                 ('1', 'ZZ09', 'polymer'), ('2', 'ZZ09', 'polymer'),
                 ('3', 'ZZ09', 'polymer'), ('4', 'ZZ09', 'polymer')`);
        await q(`INSERT INTO entity_poly (entity_id, entry_id, type, pdbx_seq_one_letter_code_can) VALUES
                 ('1', 'ZZ09', 'polypeptide(L)', 'MKT'),
                 ('2', 'ZZ09', 'polyribonucleotide', E'GCGG\\nAUUU'),
                 ('3', 'ZZ09', 'polydeoxyribonucleotide', 'ACGT'),
                 ('4', 'ZZ09', 'polydeoxyribonucleotide/polyribonucleotide hybrid', 'AG')`);
        await q(`INSERT INTO struct_asym (id, entry_id, entity_id) VALUES
                 ('A', 'ZZ09', '1'), ('B', 'ZZ09', '2'), ('C', 'ZZ09', '2'),
                 ('D', 'ZZ09', '3'), ('E', 'ZZ09', '4')`);
        return value_of(q, "nucleotide_count", "ZZ09");
    });

    assert.equal(n, 8 * 2 + 4 + 2);
});

test("R-work falls back to R observed; R-free does not", async () => {
    let got = await rolled_back(async (q) => {
        await q(`INSERT INTO entry (id) VALUES ('ZZ09'), ('ZZ08'), ('ZZ07')`);
        await q(`INSERT INTO refine (entry_id, pdbx_refine_id, ls_r_factor_r_work, ls_r_factor_obs, ls_r_factor_r_free) VALUES
                 ('ZZ09', 'X-RAY DIFFRACTION', 0.181, 0.183, 0.222),
                 ('ZZ08', 'X-RAY DIFFRACTION', NULL,  0.190, NULL)`);
        let out = [];
        for (const id of ["ZZ09", "ZZ08", "ZZ07"]) {
            out.push([await value_of(q, "r_work", id), await value_of(q, "r_free", id)]);
        }
        return out;
    });

    assert.deepEqual(got, [[0.181, 0.222], [0.19, null], [null, null]]);
});

// The test database's citations are bare ids, so one filled in here.
test("paper title, journal, year, DOI and PubMed come from the primary citation", async () => {
    let got = await rolled_back(async (q) => {
        await q(`INSERT INTO entry (id) VALUES ('ZZ09')`);
        await q(`INSERT INTO citation (id, entry_id, title, journal_abbrev, year,
                                       pdbx_database_id_doi, pdbx_database_id_pubmed) VALUES
                 ('primary', 'ZZ09', 'The fold of tRNA', 'Nature', 1974, '10.1038/250546a0', 4602655),
                 ('1',       'ZZ09', 'An older paper',  'Science', 1970, '10.1/other',         1)`);
        let out = [];
        for (const key of ["paper_title", "journal", "year", "doi", "pubmed"]) out.push(await value_of(q, key, "ZZ09"));
        return out;
    });

    assert.deepEqual(got.map(String), ["The fold of tRNA", "Nature", "1974", "10.1038/250546a0", "4602655"]);
});

test("an entry with only a first author still has authors in the report", async () => {
    let rows = (await export_entries({})).results;

    for (const row of rows) {
        if (row.author) assert.ok(row.all_authors, `${row.pdb_id} lost its authors`);
    }
});


// --- the Molecules table ------------------------------------------------
// ZZ09: protein 1; RNA 2 in two copies, label chains B and C, author chains
// R and S, with a line break in its sequence, two pseudouridines, one 5MC,
// and position 5 recorded as both PSU and U; DNA 3, synthetic; RNA 10.
async function molecule_fixture(q) {
    await q(`INSERT INTO entry (id) VALUES ('ZZ09')`);
    await q(`INSERT INTO entity (id, entry_id, type, pdbx_description) VALUES
             ('1', 'ZZ09', 'polymer', 'La protein'), ('2', 'ZZ09', 'polymer', 'tRNA-Phe'),
             ('3', 'ZZ09', 'polymer', 'DNA primer'), ('10', 'ZZ09', 'polymer', 'Guide RNA')`);
    await q(`INSERT INTO entity_poly (entity_id, entry_id, type, pdbx_seq_one_letter_code_can) VALUES
             ('1',  'ZZ09', 'polypeptide(L)', 'MKT'),
             ('2',  'ZZ09', 'polyribonucleotide', E'GUCU\\nUAG'),
             ('3',  'ZZ09', 'polydeoxyribonucleotide', 'ACGT'),
             ('10', 'ZZ09', 'polyribonucleotide', 'GG')`);
    await q(`INSERT INTO struct_asym (id, entry_id, entity_id) VALUES
             ('A', 'ZZ09', '1'), ('B', 'ZZ09', '2'), ('C', 'ZZ09', '2'),
             ('D', 'ZZ09', '3'), ('E', 'ZZ09', '10')`);
    await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id, mon_id, pdb_strand_id) VALUES
             ('A', 'ZZ09', '1', 1, 'MET', 'P'), ('B', 'ZZ09', '2', 1, 'G', 'R'), ('B', 'ZZ09', '2', 2, 'PSU', 'R'),
             ('C', 'ZZ09', '2', 1, 'G', 'b'), ('D', 'ZZ09', '3', 1, 'DA', 'T'), ('E', 'ZZ09', '10', 1, 'G', 'U')`);
    await q(`INSERT INTO entity_poly_seq (entity_id, entry_id, num, mon_id) VALUES
             ('2', 'ZZ09', 1, 'G'), ('2', 'ZZ09', 2, 'PSU'), ('2', 'ZZ09', 3, '5MC'),
             ('2', 'ZZ09', 4, 'U'), ('2', 'ZZ09', 5, 'PSU'), ('2', 'ZZ09', 5, 'U'),
             ('2', 'ZZ09', 6, 'A'), ('2', 'ZZ09', 7, 'G'), ('1', 'ZZ09', 1, 'MET')`);
    await q(`INSERT INTO entity_src_gen (entry_id, entity_id, pdbx_src_id, pdbx_gene_src_scientific_name,
                                         pdbx_gene_src_ncbi_taxonomy_id, pdbx_host_org_scientific_name) VALUES
             ('ZZ09', '1', '1', 'Homo sapiens', 9606, 'Escherichia coli')`);
    await q(`INSERT INTO entity_src_nat (entry_id, entity_id, pdbx_src_id, pdbx_organism_scientific,
                                         pdbx_ncbi_taxonomy_id) VALUES
             ('ZZ09', '2', '1', 'Saccharomyces cerevisiae', 4932)`);
    await q(`INSERT INTO pdbx_entity_src_syn (entry_id, entity_id, pdbx_src_id, organism_scientific,
                                              ncbi_taxonomy_id) VALUES
             ('ZZ09', '3', '1', 'synthetic construct', 32630)`);
}

const molecules = (params) => rolled_back(async (q) => {
    await molecule_fixture(q);
    return export_molecules({ entry_id: "ZZ09", ...params }, q);
});

test("Molecules: nucleic acids only by default, each once, before proteins when asked", async () => {
    let na = await molecules({});
    let all = await molecules({ proteins: "1" });

    assert.deepEqual(na.results.map((r) => r.molecule_id), ["2", "3", "10"]);
    assert.deepEqual(all.results.map((r) => r.molecule_id), ["2", "3", "10", "1"]);
    assert.equal(na.total, 3);
    assert.equal(all.proteins, true);
    assert.equal((await molecules({ proteins: "yes" })).results.length, 3, "only 1 means proteins");
});

test("Molecules: author chains, copies, name, type, length and sequence", async () => {
    let [rna, dna] = (await molecules({})).results;

    assert.deepEqual(
        [rna.pdb_id, rna.chains, rna.copies, rna.molecule_name, rna.molecule_type, rna.length, rna.sequence],
        ["ZZ09", "R, b", 2, "tRNA-Phe", "RNA", 7, "GUCUUAG"]);
    assert.deepEqual([dna.molecule_type, dna.chains, dna.copies], ["DNA", "T", 1]);
});

test("Molecules: modified residues by position, a two-residue position once", async () => {
    let [rna, dna] = (await molecules({})).results;

    assert.equal(rna.modified, "PSU 2,5; 5MC 3");
    assert.equal(dna.modified, null);
});

test("Molecules: how each was made, and where", async () => {
    let rows = (await molecules({ proteins: "1" })).results;
    let by = Object.fromEntries(rows.map((r) => [r.molecule_id, r]));

    assert.deepEqual([by[2].obtained, by[2].organism, by[2].taxonomy_id, by[2].expression_host],
                     ["Natural", "Saccharomyces cerevisiae", "4932", null]);
    assert.deepEqual([by[3].obtained, by[3].organism], ["Synthetic", "synthetic construct"]);
    assert.deepEqual([by[1].obtained, by[1].organism, by[1].expression_host],
                     ["Expressed", "Homo sapiens", "Escherichia coli"]);
    assert.deepEqual([by[10].obtained, by[10].organism], ["Not recorded", null]);
});

test("Molecules rows follow the entries in the order Structures gives them", async () => {
    let entries = (await export_entries({ sort: "resolution_asc" })).results.map((r) => r.pdb_id);
    let rows = (await export_molecules({ sort: "resolution_asc" })).results;

    assert.ok(rows.length > 0, "the test data must have nucleic acid molecules");
    let seen = [...new Set(rows.map((r) => r.pdb_id))];
    assert.deepEqual(seen, entries.filter((id) => seen.includes(id)));
});

test("Molecules returns exactly the table's fields", async () => {
    let row = (await molecules({})).results[0];
    let table = REPORT_TABLES.find((t) => t.key === "molecules");

    assert.deepEqual(Object.keys(row), report_fields(table).map((f) => f.key));
});

test("/api/export/molecules follows the search and turns away a bad one", async () => {
    let res = await fetch(base + "/api/export/molecules?q=tRNA");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.ok(body.results.every((r) => r.molecule_type !== "Protein"));
    assert.equal((await fetch(base + "/api/export/molecules?resolution_min=abc")).status, 400);
});

test("?proteins= alone is not a search and does not open the report", async () => {
    assert.equal((await fetch(base + "/report?proteins=1", { redirect: "manual" })).status, 302);
});


// --- Ligands ------------------------------------------------------------

// ZZ09: a made-up ion ZQ1 in three copies as entity 10, water as 3 (one
// struct_asym row holds all 40), and ZQ2 as 2, named differently by the entry
// than by the dictionary. Codes the test seed cannot already hold.
async function ligand_fixture(q) {
    await q(`INSERT INTO entry (id) VALUES ('ZZ09')`);
    await q(`INSERT INTO chem_comp (id, type, name, formula, formula_weight, pdbx_synonyms) VALUES
             ('ZQ1', 'non-polymer', 'ZQ ION', 'Zq 2', 12.5, NULL),
             ('ZQ2', 'non-polymer', 'ZQ SUGAR', 'C6 H12 O6', 180.156, 'zq-glucose'),
             ('ZQ3', 'non-polymer', 'ZQ SULFATE', 'O4 S -2', 96.063, NULL)
             ON CONFLICT DO NOTHING`);
    await q(`INSERT INTO entity (id, entry_id, type, pdbx_number_of_molecules) VALUES
             ('10', 'ZZ09', 'non-polymer', 3), ('2', 'ZZ09', 'non-polymer', 1),
             ('3', 'ZZ09', 'water', 40)`);
    await q(`INSERT INTO pdbx_entity_nonpoly (entity_id, entry_id, name, comp_id) VALUES
             ('10', 'ZZ09', 'ZQ ION', 'ZQ1'), ('2', 'ZZ09', 'the sugar', 'ZQ2'),
             ('3', 'ZZ09', 'water', 'HOH')`);
}

const ligands = (params) => rolled_back(async (q) => {
    await ligand_fixture(q);
    return export_ligands({ entry_id: "ZZ09", ...params }, q);
});

test("Ligands: no water unless asked, in the entry's own order", async () => {
    let dry = await ligands({});
    let wet = await ligands({ water: "1" });

    assert.deepEqual(dry.results.map((r) => r.ligand_code), ["ZQ2", "ZQ1"]);
    assert.deepEqual(wet.results.map((r) => r.ligand_code), ["ZQ2", "HOH", "ZQ1"]);
    assert.equal(wet.water, true);
    assert.equal((await ligands({ water: "yes" })).total, 2, "only 1 means water");
});

test("Ligands: dictionary name, formula, weight, synonyms and every copy", async () => {
    let [sugar, ion] = (await ligands({})).results;

    assert.deepEqual(sugar, { pdb_id: "ZZ09", ligand_code: "ZQ2", ligand_name: "ZQ SUGAR", ligand_copies: 1,
                              formula: "C6 H12 O6", charge: 0, weight: 180.156, synonyms: "zq-glucose" });
    assert.equal(ion.ligand_copies, 3);
    assert.deepEqual([ion.formula, ion.charge], ["Zq", 2], "the PDB's 'Zq 2' is Zq with charge 2");
    assert.equal(ion.synonyms, null);
});

test("Ligands: the charge the PDB writes after a formula is its own column", async () => {
    let select = (key) => LIGAND_COLUMNS.find((c) => c.key === key).select;
    let got = await rolled_back(async (q) => {
        await ligand_fixture(q);
        await q(`INSERT INTO chem_comp (id, name) VALUES ('ZQ4', 'ZQ UNKNOWN') ON CONFLICT DO NOTHING`);
        return (await q(`SELECT cc.id, ${select("formula")} AS formula, ${select("charge")} AS charge
                           FROM chem_comp cc WHERE cc.id IN ('ZQ1', 'ZQ2', 'ZQ3', 'ZQ4') ORDER BY cc.id`)).rows;
    });

    assert.deepEqual(got.map((r) => [r.id, r.formula, r.charge]),
                     [["ZQ1", "Zq", 2], ["ZQ2", "C6 H12 O6", 0], ["ZQ3", "O4 S", -2], ["ZQ4", null, null]]);
});

test("Ligands returns exactly the table's fields", async () => {
    let row = (await ligands({})).results[0];
    let table = REPORT_TABLES.find((t) => t.key === "ligands");

    assert.deepEqual(Object.keys(row).sort(), report_fields(table).map((f) => f.key).sort());
});

test("Ligands rows follow the order of the Structures export", async () => {
    let params = { q: "tRNA", sort: "resolution_asc" };
    let order = (await export_entries(params)).results.map((r) => r.pdb_id);
    let seen = [...new Set((await export_ligands(params)).results.map((r) => r.pdb_id))];

    assert.ok(seen.length > 0);
    assert.deepEqual(seen, order.filter((id) => seen.includes(id)));
});

test("/api/export/ligands follows the search and turns away a bad one", async () => {
    let res = await fetch(base + "/api/export/ligands?q=tRNA");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.ok(body.results.every((r) => r.ligand_code !== "HOH"));
    assert.equal((await fetch(base + "/api/export/ligands?resolution_min=abc")).status, 400);
});

test("?water= alone is not a search and does not open the report", async () => {
    assert.equal((await fetch(base + "/report?water=1", { redirect: "manual" })).status, 302);
});


// --- base_pairs.dbn -----------------------------------------------------

test("dot_bracket_record: chains joined by &, crossing pairs in [], one pair per base", () => {
    let chains = [{ asym: "A", auth: "X", sequence: "GGGAAACCCU" }, { asym: "B", auth: "Y", sequence: "GCAU" }];
    let pairs = [{ asym_1: "B", pos_1: 3, asym_2: "A", pos_2: 10 },  // given second end first
                 { asym_1: "A", pos_1: 1, asym_2: "B", pos_2: 1 },   // after A1-A9 along the ruler: dropped
                 { asym_1: "A", pos_1: 1, asym_2: "A", pos_2: 9 },
                 { asym_1: "A", pos_1: 2, asym_2: "A", pos_2: 8 },
                 { asym_1: "A", pos_1: 3, asym_2: "A", pos_2: 7 },
                 { asym_1: "A", pos_1: 4, asym_2: "B", pos_2: 4 },   // crosses A1-A9
                 { asym_1: "A", pos_1: 5, asym_2: "A", pos_2: 11 },  // past the end
                 { asym_1: "A", pos_1: 5, asym_2: "C", pos_2: 1 }];  // not a chain of the record

    assert.equal(dot_bracket_record("ZZ09", chains, pairs),
                 ">ZZ09|Chains X, Y\nGGGAAACCCU&GCAU\n((([..)))(&..)]\n");
    assert.equal(dot_bracket_record("ZZ09", chains.slice(0, 1), []),
                 ">ZZ09|Chain X\nGGGAAACCCU\n..........\n");
});

// ZZ09: RNA chains A (author X, GGGAAACCCU) and B (author Y, GCAU) with a
// hairpin, a pair across the chains, a PSU-A pair, and pairs the file must
// leave out. ZZ08: RNA with no annotation at all.
async function pair_fixture(q) {
    await q(`INSERT INTO entry (id) VALUES ('ZZ09'), ('ZZ08')`);
    await q(`INSERT INTO chem_comp (id, mon_nstd_flag, parent_comp_id) VALUES ('PSU', 'n', 'U')
             ON CONFLICT (id) DO UPDATE SET parent_comp_id = EXCLUDED.parent_comp_id`);
    await q(`INSERT INTO entity (id, entry_id, type) VALUES
             ('1', 'ZZ09', 'polymer'), ('2', 'ZZ09', 'polymer'), ('1', 'ZZ08', 'polymer')`);
    await q(`INSERT INTO entity_poly (entity_id, entry_id, type, pdbx_seq_one_letter_code_can) VALUES
             ('1', 'ZZ09', 'polyribonucleotide', E'GGGAA\\nACCCU'), ('2', 'ZZ09', 'polyribonucleotide', 'GCAU'),
             ('1', 'ZZ08', 'polyribonucleotide', 'GGAA')`);
    await q(`INSERT INTO struct_asym (id, entry_id, entity_id) VALUES
             ('A', 'ZZ09', '1'), ('B', 'ZZ09', '2'), ('A', 'ZZ08', '1')`);
    await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id, mon_id, pdb_strand_id) VALUES
             ('A', 'ZZ09', '1', 1, 'G', 'X'), ('B', 'ZZ09', '2', 1, 'G', 'Y'), ('A', 'ZZ08', '1', 1, 'G', 'A')`);

    // [model, asym 1, seq 1, comp 1, asym 2, seq 2, comp 2, family, copy 2]
    let pairs = [[1, "A", 1, "G", "A", 9, "C", "cWW"], [1, "A", 2, "G", "A", 8, "C", "cWW"],
                 [1, "A", 3, "G", "A", 7, "C", "cWW"], [1, "A", 4, "A", "B", 4, "U", "cWW"],
                 [1, "A", 10, "PSU", "B", 3, "A", "cWW"],
                 [1, "A", 5, "A", "A", 6, "U", "tWH"],          // A-U, but not cWW
                 [1, "A", 5, "A", "B", 2, "C", "cWW"],          // A-C: not canonical
                 [1, "A", 5, "A", "B", 1, "U", "cWW", "2_555"], // with a symmetry copy
                 [2, "A", 5, "A", "A", 6, "U", "cWW"]];         // a later model
    for (const [n, [model, a1, s1, c1, a2, s2, c2, family, copy]] of pairs.entries()) {
        await q(`INSERT INTO ndb_base_pair_list (base_pair_id, entry_id, pdb_model_number,
                     asym_id_1, seq_id_1, comp_id_1, auth_asym_id_1, auth_seq_id_1,
                     asym_id_2, seq_id_2, comp_id_2, auth_asym_id_2, auth_seq_id_2, struct_oper_id_2)
                 VALUES ($1, 'ZZ09', $2, $3, $4, $5, $3, $6, $7, $8, $9, $7, $10, $11)`,
                [n + 1, model, a1, s1, c1, String(s1), a2, s2, c2, String(s2), copy ?? "1"]);
        await q(`INSERT INTO ndb_base_pair_annotation (base_pair_id, entry_id, lw_family, class)
                 VALUES ($1, 'ZZ09', $2, 'x')`, [n + 1, family]);
    }
}

const dot_brackets = (id) => rolled_back(async (q) => {
    await pair_fixture(q);
    return export_dot_brackets({ entry_id: id }, q);
});

test("base_pairs.dbn keeps canonical cWW pairs of the file's own chains, first model", async () => {
    let got = await dot_brackets("ZZ09");

    assert.equal(got.text, ">ZZ09|Chains X, Y\nGGGAAACCCU&GCAU\n((([..)))(&..)]\n");
    assert.equal(got.records, 1);
    assert.deepEqual(got.unannotated, []);
});

test("an entry with no annotation gets no record and is named instead", async () => {
    let got = await dot_brackets("ZZ08");

    assert.equal(got.text, "");
    assert.deepEqual(got.unannotated, ["ZZ08"]);
});

test("/api/export/dbn follows the search and turns away a bad one", async () => {
    let res = await fetch(base + "/api/export/dbn?q=tRNA");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(typeof body.text, "string");
    assert.ok(Array.isArray(body.unannotated));
    assert.equal((await fetch(base + "/api/export/dbn?resolution_min=abc")).status, 400);
});


// --- the page -----------------------------------------------------------

test("asked_table takes a known table and falls back to Structures", () => {
    assert.equal(asked_table("ligands"), "ligands");
    for (const bad of [undefined, "", "LIGANDS", "nope", ["ligands"]]) {
        assert.equal(asked_table(bad), "structures", String(bad));
    }
});

test("/report opens on the table ?table= names, Structures otherwise", async () => {
    let selected = (html) => html.match(/data-table="(\w+)"\s+aria-controls="report_fields"\s+aria-selected="true"/)[1];

    assert.equal(selected(await (await fetch(base + "/report?q=tRNA")).text()), "structures");
    assert.equal(selected(await (await fetch(base + "/report?q=tRNA&table=molecules")).text()), "molecules");
    assert.equal(selected(await (await fetch(base + "/report?q=tRNA&table=zzz")).text()), "structures");

    let html = await (await fetch(base + "/report?q=tRNA")).text();
    assert.equal(html.match(/role="tab"/g).length, 3);
    assert.match(html, /Download CSV/);
    assert.match(html, /Download all \(ZIP\)/);

    // The reason for three tables is one closed link, outside the tab list.
    let why = html.match(/<details class="report_why">([\s\S]*?)<\/details>/);
    assert.ok(why, "the Why three tables note is on the page");
    assert.match(why[1], /<summary>Why three tables\?<\/summary>/);
    assert.match(why[1], /Entry ID links them/);
    assert.doesNotMatch(why[0], /\sopen[\s>]/);
    assert.doesNotMatch(html, /structure level|entity level|—/i);
});

test("?table= alone is not a search and does not open the report", async () => {
    let res = await fetch(base + "/report?table=ligands", { redirect: "manual" });

    assert.equal(res.status, 302);
});


// --- the page's scripts -------------------------------------------------
// The report page loads plain scripts that share one global scope, so a name
// declared twice stops the later script dead: report.js once declared KEY,
// which theme.js already had, and the theme switch quit on this page.
test("the report page's scripts declare no top-level name twice", async () => {
    let { readFileSync } = await import("node:fs");
    let html = await (await fetch(base + "/report?q=tRNA")).text();
    let scripts = [...html.matchAll(/<script src="\/([\w.]+\.js)"/g)].map((m) => m[1]);
    let seen = new Map();

    assert.ok(scripts.includes("report.js") && scripts.includes("theme.js"));
    for (const file of scripts) {
        let text = readFileSync(`public/${file}`, "utf8");
        for (const [, name] of text.matchAll(/^(?:let|const|var|function|async function|class)\s+(\w+)/gm)) {
            assert.ok(!seen.has(name), `${name} is declared in ${seen.get(name)} and ${file}`);
            seen.set(name, file);
        }
    }
});
