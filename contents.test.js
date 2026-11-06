// contents.test.js - checks entry_contents, which lists every molecule in one
// structure. The test database is flat (one or two entities, no chains), so
// each test builds a fuller structure inside a transaction and rolls it back.

import test, { after } from "node:test";
import assert from "node:assert";
import { query, transaction, close } from "./db.js";
import { entry_contents, entry_citations, find_entry, search_entries, build_where,
         missing_runs, entry_base_pairs } from "./search.js";
import { COLUMNS, FILTERS, ENTITY_NAME_LIMIT, SORTS, columns_answering } from "./filters.js";
import { detail_rows, molecule_groups, species_case, source_section, FOLD_PROTEINS, POSITIONS_SHOWN,
         SOURCE_LISTED, base_pair_section, PAIR_LINKS_SHOWN } from "./detail.js";

after(() => close());

const ROLLBACK = new Error("rollback");

// Runs `work` against a fixture entry that never outlives the test.
async function with_fixture(work) {
    let result;
    try {
        await transaction(async (q) => {
            await insert_fixture(q);
            result = await work(q);
            throw ROLLBACK;
        });
    } catch (err) {
        if (err !== ROLLBACK) throw err;
    }
    return result;
}

// ZZ01: a protein listed first, as in 786 real entries, then RNA, DNA, a
// hybrid, a magnesium ion and water. Ids out of order on purpose ("10" < "2").
async function insert_fixture(q) {
    await q(`INSERT INTO entry (id) VALUES ('ZZ01')`);

    await q(`INSERT INTO entity (id, entry_id, type, pdbx_description,
                                 formula_weight, pdbx_number_of_molecules) VALUES
             ('1',  'ZZ01', 'polymer',     'Lupus La protein', 12000.5, 1),
             ('2',  'ZZ01', 'polymer',     'tRNA-Phe',          8000,   2),
             ('3',  'ZZ01', 'polymer',     'DNA template',      3000,   1),
             ('10', 'ZZ01', 'polymer',     'DNA/RNA primer',    2000,   1),
             ('4',  'ZZ01', 'non-polymer', 'MAGNESIUM ION',     24.3,   3),
             ('5',  'ZZ01', 'water',       'water',             18,     40)`);

    await q(`INSERT INTO entity_poly (entity_id, entry_id, type,
                                      pdbx_seq_one_letter_code_can) VALUES
             ('1',  'ZZ01', 'polypeptide(L)',    'MKT'),
             ('2',  'ZZ01', 'polyribonucleotide', E'GCGG\nAUUU'),
             ('3',  'ZZ01', 'polydeoxyribonucleotide', 'ACGT'),
             ('10', 'ZZ01', 'polydeoxyribonucleotide/polyribonucleotide hybrid', 'AG')`);

    await q(`INSERT INTO pdbx_entity_nonpoly (entity_id, entry_id, name, comp_id)
             VALUES ('4', 'ZZ01', 'MAGNESIUM ION', 'MG'), ('5', 'ZZ01', 'water', 'HOH')`);

    // Entity 2 has two copies, chains B and C. MG has three, water one.
    await q(`INSERT INTO struct_asym (id, entry_id, entity_id) VALUES
             ('A', 'ZZ01', '1'), ('B', 'ZZ01', '2'), ('C', 'ZZ01', '2'),
             ('D', 'ZZ01', '3'), ('E', 'ZZ01', '10'),
             ('F', 'ZZ01', '4'), ('G', 'ZZ01', '4'), ('H', 'ZZ01', '4'),
             ('I', 'ZZ01', '5')`);

    // Author chain letters differ from label ids, as they often do.
    await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id,
                                               mon_id, pdb_strand_id) VALUES
             ('A', 'ZZ01', '1', 1, 'MET', 'P'), ('A', 'ZZ01', '1', 2, 'LYS', 'P'),
             ('B', 'ZZ01', '2', 1, 'G',   'R'), ('C', 'ZZ01', '2', 1, 'G', 'S'),
             ('D', 'ZZ01', '3', 1, 'DA',  'T'), ('E', 'ZZ01', '10', 1, 'DA', 'U')`);
}


test("lists every entity, not only entity 1", async () => {
    let c = await with_fixture((q) => entry_contents("ZZ01", q));
    assert.equal(c.entities.length, 6);
});

test("puts nucleic acids first, then protein, then ligands, then water", async () => {
    let c = await with_fixture((q) => entry_contents("ZZ01", q));
    assert.deepEqual(c.entities.map((e) => e.kind),
                     ["RNA", "DNA", "DNA/RNA hybrid", "Protein", "Ligand", "Water"]);
});

test("orders entity ids as numbers within a kind", async () => {
    let c = await with_fixture(async (q) => {
        await q(`UPDATE entity_poly SET type = 'polyribonucleotide'
                 WHERE entry_id = 'ZZ01' AND entity_id IN ('3', '10')`);
        return entry_contents("ZZ01", q);
    });
    assert.deepEqual(c.entities.filter((e) => e.kind === "RNA").map((e) => e.id),
                     ["2", "3", "10"]);
});

test("each entity carries its name, copies, weight and ligand code", async () => {
    let c = await with_fixture((q) => entry_contents("ZZ01", q));
    let rna = c.entities.find((e) => e.id === "2");
    let mg  = c.entities.find((e) => e.id === "4");

    assert.equal(rna.description, "tRNA-Phe");
    assert.equal(rna.copies, 2);
    assert.equal(rna.formula_weight, 8000);
    assert.equal(rna.comp_id, null);

    assert.equal(mg.comp_id, "MG");
    assert.equal(mg.sequence, null);
});

test("sequences lose the line breaks CIF wraps them with", async () => {
    let c = await with_fixture((q) => entry_contents("ZZ01", q));
    let rna = c.entities.find((e) => e.id === "2");
    assert.equal(rna.sequence, "GCGGAUUU");
    assert.equal(rna.length, 8);
});

test("each entity lists its chains, with label and author ids", async () => {
    let c = await with_fixture((q) => entry_contents("ZZ01", q));
    let rna = c.entities.find((e) => e.id === "2");
    let mg  = c.entities.find((e) => e.id === "4");

    assert.deepEqual(rna.chains.map(({ label, auth }) => ({ label, auth })),
                     [{ label: "B", auth: "R" }, { label: "C", auth: "S" }]);
    assert.deepEqual(mg.chains.map((ch) => ch.label), ["F", "G", "H"]);
    assert.equal(mg.chains[0].auth, null, "no poly_seq_scheme row for a ligand");
});

test("ignores case in the id, like find_entry", async () => {
    let c = await with_fixture((q) => entry_contents("zz01", q));
    assert.equal(c.entities.length, 6);
});

test("an entry with no entities gives an empty list, not undefined", async () => {
    let c = await with_fixture(async (q) => {
        await q(`INSERT INTO entry (id) VALUES ('ZZ02')`);
        return entry_contents("ZZ02", q);
    });
    assert.deepEqual(c.entities, []);
});

// --- entity_name on the card and the page (micro-goal 1.1) --------------

// The column's own SQL, run inside the fixture's transaction.
async function entity_name_of(id, q) {
    let select = COLUMNS.find((c) => c.key === "entity_name").select;
    let r = await q(`SELECT ${select} AS v FROM entry e WHERE e.id = $1`, [id]);
    return r.rows[0].v;
}

test("entity_name names every polymer, nucleic acids first", async () => {
    let v = await with_fixture((q) => entity_name_of("ZZ01", q));
    assert.equal(v, "tRNA-Phe; DNA template; DNA/RNA primer; Lupus La protein");
});

test("entity_name leaves out ligands and water", async () => {
    let v = await with_fixture((q) => entity_name_of("ZZ01", q));
    assert.ok(!v.includes("MAGNESIUM") && !v.includes("water"));
});

test("entity_name names a repeated description once", async () => {
    let v = await with_fixture(async (q) => {
        await q(`UPDATE entity SET pdbx_description = 'tRNA-Phe'
                 WHERE entry_id = 'ZZ01' AND id = '3'`);
        return entity_name_of("ZZ01", q);
    });
    assert.equal(v, "tRNA-Phe; DNA/RNA primer; Lupus La protein");
});

test("entity_name stops at the limit and says how many it left out", async () => {
    let v = await with_fixture(async (q) => {
        for (let i = 20; i < 26; i++) {
            await q(`INSERT INTO entity (id, entry_id, type, pdbx_description)
                     VALUES ($1, 'ZZ01', 'polymer', $2)`, [String(i), `Protein ${i}`]);
            await q(`INSERT INTO entity_poly (entity_id, entry_id, type)
                     VALUES ($1, 'ZZ01', 'polypeptide(L)')`, [String(i)]);
        }
        return entity_name_of("ZZ01", q);
    });
    let names = v.split("; ");
    assert.equal(names.length, ENTITY_NAME_LIMIT + 1);
    assert.equal(names[0], "tRNA-Phe");
    assert.equal(names.at(-1), `+ ${10 - ENTITY_NAME_LIMIT} more`);
});

test("find_entry and search still return entity_name", async () => {
    assert.equal((await find_entry("4TNA")).entity_name, "TRNAPHE");
    let page = await search_entries({ entry_id: "4TNA" });
    assert.equal(page.results[0].entity_name, "TRNAPHE");
});

// --- the entity_name filter (micro-goal 1.2) ----------------------------
// The filter was always an EXISTS over every entity; these pin that down so
// it cannot drift back to entity 1 the way the displayed column had.

async function matches(params, q) {
    let { where, values } = build_where(params);
    let r = await q(`SELECT e.id FROM entry e WHERE ${where}`, values);
    return r.rows.map((row) => row.id);
}

test("the entity_name filter finds an entry by a later entity", async () => {
    let found = await with_fixture((q) => matches({ entity_name: "DNA template" }, q));
    assert.ok(found.includes("ZZ01"));
});

test("the entity_name filter finds an entry by entity 10, past entity 9", async () => {
    let found = await with_fixture((q) => matches({ entity_name: "primer" }, q));
    assert.ok(found.includes("ZZ01"));
});

test("the entity_name filter still finds an entry by entity 1", async () => {
    let found = await with_fixture((q) => matches({ entity_name: "lupus" }, q));
    assert.ok(found.includes("ZZ01"));
});

test("the entity_name filter matches a name past the five the card shows", async () => {
    let found = await with_fixture(async (q) => {
        for (let i = 20; i < 26; i++) {
            await q(`INSERT INTO entity (id, entry_id, type, pdbx_description)
                     VALUES ($1, 'ZZ01', 'polymer', $2)`, [String(i), `Ribosomal protein L${i}`]);
        }
        return matches({ entity_name: "protein L25" }, q);
    });
    assert.ok(found.includes("ZZ01"));
});

test("excludes mode leaves out an entry whose later entity matches", async () => {
    let found = await with_fixture((q) =>
        matches({ entity_name: "DNA template", match: "excludes" }, q));
    assert.ok(!found.includes("ZZ01"));
});

test("the search box's document gathers every entity, not entity 1", async () => {
    let r = await query(`SELECT pg_get_viewdef('doc'::regclass) AS def`);
    assert.doesNotMatch(r.rows[0].def, /\.id\s*=\s*'1'/);
    assert.match(r.rows[0].def, /string_agg\(DISTINCT en\.pdbx_description/);
});

// --- polymer type: DNA, RNA or both (micro-goal 1.3) --------------------

// An entry ZZ03 holding one polymer entity per type given, then `work`.
async function with_types(types, work) {
    return with_fixture(async (q) => {
        await q(`INSERT INTO entry (id) VALUES ('ZZ03')`);
        for (const [i, type] of types.entries()) {
            await q(`INSERT INTO entity (id, entry_id, type) VALUES ($1, 'ZZ03', 'polymer')`,
                    [String(i + 1)]);
            await q(`INSERT INTO entity_poly (entity_id, entry_id, type) VALUES ($1, 'ZZ03', $2)`,
                    [String(i + 1), type]);
        }
        return work(q);
    });
}

async function polymer_type_of(types) {
    let select = COLUMNS.find((c) => c.key === "polymer_type").select;
    return with_types(types, async (q) =>
        (await q(`SELECT ${select} AS v FROM entry e WHERE e.id = 'ZZ03'`)).rows[0].v);
}

const RNA = "polyribonucleotide";
const DNA = "polydeoxyribonucleotide";
const HYBRID = "polydeoxyribonucleotide/polyribonucleotide hybrid";
const PROTEIN = "polypeptide(L)";

const type_cases = [
    [[RNA],                    "RNA"],
    [[DNA],                    "DNA"],
    [[DNA, DNA],               "DNA"],
    [[DNA, RNA],               "DNA/RNA"],
    [[HYBRID],                 "DNA/RNA"],
    [[PROTEIN, RNA],           "Protein/RNA"],
    [[PROTEIN, DNA],           "Protein/DNA"],
    [[PROTEIN, DNA, RNA],      "Protein/DNA/RNA"],
    [[PROTEIN, HYBRID],        "Protein/DNA/RNA"],
    [["polypeptide(D)", DNA],  "Protein/DNA"],
    [[PROTEIN],                "Protein"],
    [["polysaccharide(D)"],    "Oligosaccharide"],
    [[PROTEIN, "polysaccharide(D)"], "Protein/Oligosaccharide"],
    [["other"],                "Other"]
];

for (const [types, expected] of type_cases) {
    test(`polymer type of [${types.join(", ")}] is ${expected}`, async () => {
        assert.equal(await polymer_type_of(types), expected);
    });
}

test("the polymer type filter offers every value the column can produce", () => {
    let offered = FILTERS.find((f) => f.key === "polymer_type").options.map((o) => o.value);
    for (const [, expected] of type_cases) assert.ok(offered.includes(expected), expected);
});

test("the polymer type filter finds a DNA entry and not an RNA one", async () => {
    let [dna, rna] = await with_types([DNA], async (q) =>
        [await matches({ polymer_type: "DNA" }, q), await matches({ polymer_type: "RNA" }, q)]);
    assert.ok(dna.includes("ZZ03"));
    assert.ok(!rna.includes("ZZ03"));
});

// Bookmarks made before the split carry the old values.
test("an old 'Nucleic acid' link still finds DNA, RNA and DNA/RNA entries", async () => {
    for (const types of [[DNA], [RNA], [HYBRID]]) {
        let found = await with_types(types, (q) => matches({ polymer_type: "Nucleic acid" }, q));
        assert.ok(found.includes("ZZ03"), types.join());
    }
});

test("an old 'Protein/NA' link still finds every protein-nucleic acid mix", async () => {
    for (const types of [[PROTEIN, DNA], [PROTEIN, RNA], [PROTEIN, DNA, RNA]]) {
        let found = await with_types(types, (q) => matches({ polymer_type: "Protein/NA" }, q));
        assert.ok(found.includes("ZZ03"), types.join());
    }
});

test("an old link does not widen into the protein-only entries", async () => {
    let found = await with_types([PROTEIN], (q) => matches({ polymer_type: "Protein/NA" }, q));
    assert.ok(!found.includes("ZZ03"));
});

// --- chain count (micro-goal 1.5) ---------------------------------------
// struct_asym has a row per ligand and per water as well as per chain:
// 77,095 of its 97,441 rows in the real data.

async function column_of(key, id, q) {
    let select = COLUMNS.find((c) => c.key === key).select;
    let r = await q(`SELECT ${select} AS v FROM entry e WHERE e.id = $1`, [id]);
    return r.rows[0].v;
}

test("Chains counts polymer chains, not ligands or water", async () => {
    // ZZ01: A protein, B and C RNA, D DNA, E hybrid; F-H magnesium; I water.
    assert.equal(await with_fixture((q) => column_of("chain_count", "ZZ01", q)), 5);
});

test("Chains counts every copy of a polymer", async () => {
    let n = await with_fixture(async (q) => {
        await q(`INSERT INTO struct_asym (id, entry_id, entity_id) VALUES ('J', 'ZZ01', '2')`);
        return column_of("chain_count", "ZZ01", q);
    });
    assert.equal(n, 6);
});

test("Chains is 0 for an entry with only ligands", async () => {
    let n = await with_fixture(async (q) => {
        await q(`DELETE FROM struct_asym WHERE entry_id = 'ZZ01' AND id IN ('A','B','C','D','E')`);
        return column_of("chain_count", "ZZ01", q);
    });
    assert.equal(n, 0);
});

test("Chains agrees with the chains entry_contents lists for polymers", async () => {
    let [n, c] = await with_fixture(async (q) =>
        [await column_of("chain_count", "ZZ01", q), await entry_contents("ZZ01", q)]);
    let polymer_chains = c.entities.filter((e) => e.type === "polymer")
                                   .reduce((sum, e) => sum + e.chains.length, 0);
    assert.equal(n, polymer_chains);
});

// --- residue count (micro-goal 1.6) -------------------------------------
// entity_poly_seq is one row per residue per ENTITY, so two copies of a chain
// counted once. pdbx_poly_seq_scheme is one row per residue per CHAIN.

test("Residues counts every residue of every chain", async () => {
    // ZZ01: chain A has 2 residues; B, C, D and E one each.
    assert.equal(await with_fixture((q) => column_of("residue_count", "ZZ01", q)), 6);
});

test("Residues counts both copies of a repeated chain", async () => {
    let n = await with_fixture(async (q) => {
        await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id, mon_id)
                 VALUES ('B', 'ZZ01', '2', 2, 'C'), ('C', 'ZZ01', '2', 2, 'C')`);
        return column_of("residue_count", "ZZ01", q);
    });
    assert.equal(n, 8);
});

test("Residues counts a position with two alternative residues once", async () => {
    let n = await with_fixture(async (q) => {
        await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id,
                                                   mon_id, hetero)
                 VALUES ('A', 'ZZ01', '1', 2, 'ARG', 'y')`);
        return column_of("residue_count", "ZZ01", q);
    });
    assert.equal(n, 6);
});

test("Residues does not read entity_poly_seq, which counts each entity once", async () => {
    let n = await with_fixture(async (q) => {
        await q(`INSERT INTO entity_poly_seq (entity_id, entry_id, num, mon_id)
                 VALUES ('2', 'ZZ01', 1, 'G'), ('2', 'ZZ01', 2, 'C')`);
        return column_of("residue_count", "ZZ01", q);
    });
    assert.equal(n, 6);
});

// --- nucleotide count (micro-goal 1.6b) ---------------------------------
// Residues includes protein, which hides the nucleic acid: 2VON has 400
// residues and 14 nucleotides.

test("Nucleotides counts DNA, RNA and hybrid residues, not protein", async () => {
    // ZZ01: protein A has 2 residues; RNA B and C, DNA D and hybrid E one each.
    assert.equal(await with_fixture((q) => column_of("nucleotide_count", "ZZ01", q)), 4);
});

test("Nucleotides counts both copies of a repeated nucleic acid chain", async () => {
    let n = await with_fixture(async (q) => {
        await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id, mon_id)
                 VALUES ('B', 'ZZ01', '2', 2, 'C'), ('C', 'ZZ01', '2', 2, 'C')`);
        return column_of("nucleotide_count", "ZZ01", q);
    });
    assert.equal(n, 6);
});

test("Nucleotides counts a position with two alternative residues once", async () => {
    let n = await with_fixture(async (q) => {
        await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id,
                                                   mon_id, hetero)
                 VALUES ('D', 'ZZ01', '3', 1, 'DG', 'y')`);
        return column_of("nucleotide_count", "ZZ01", q);
    });
    assert.equal(n, 4);
});

test("Nucleotides is 0 for a protein-only entry, and never more than Residues", async () => {
    let [nt, res] = await with_fixture(async (q) => {
        await q(`UPDATE entity_poly SET type = 'polypeptide(L)' WHERE entry_id = 'ZZ01'`);
        return [await column_of("nucleotide_count", "ZZ01", q),
                await column_of("residue_count", "ZZ01", q)];
    });
    assert.equal(nt, 0);
    assert.ok(nt <= res);
});

test("the structure page shows Nucleotides right after Residues", () => {
    let keys = COLUMNS.map((c) => c.key);
    assert.equal(keys.indexOf("nucleotide_count"), keys.indexOf("residue_count") + 1);
});

test("works on the plain test data without a fixture", async () => {
    let c = await entry_contents("4TNA");
    assert.ok(c.entities.length >= 1);
    assert.equal(c.entities[0].kind, "RNA");
});

// --- atom count (micro-goal 1.7) ----------------------------------------
// One copy of the structure: model 1 only, no water.

async function insert_atoms(q, rows) {
    for (let [asym, comp, model] of rows) {
        await q(`INSERT INTO atom_site (entry_id, label_asym_id, label_comp_id,
                                        pdbx_pdb_model_num) VALUES ('ZZ01', $1, $2, $3)`,
                [asym, comp, model]);
    }
}

test("Atoms counts model 1 only, not every NMR model", async () => {
    let n = await with_fixture(async (q) => {
        await insert_atoms(q, [["B", "G", 1], ["B", "G", 1], ["B", "G", 2], ["B", "G", 2]]);
        return column_of("atom_count", "ZZ01", q);
    });
    assert.equal(n, 2);
});

test("Atoms leaves out water but keeps a ligand", async () => {
    let n = await with_fixture(async (q) => {
        await insert_atoms(q, [["D", "DA", 1], ["F", "MG", 1], ["I", "HOH", 1], ["I", "HOH", 1]]);
        return column_of("atom_count", "ZZ01", q);
    });
    assert.equal(n, 2);
});

test("Atoms is 0 for an entry with no coordinates", async () => {
    assert.equal(await with_fixture((q) => column_of("atom_count", "ZZ01", q)), 0);
});

// --- modified nucleotides only (micro-goal 1.8) -------------------------
// A protein label such as MSE does not make a nucleic acid entry non-standard.

async function with_residues(rows, work) {
    return with_fixture(async (q) => {
        await q(`INSERT INTO chem_comp (id, mon_nstd_flag) VALUES ('MSE', 'n'), ('PSU', 'n')
                 ON CONFLICT (id) DO NOTHING`);
        for (let [entity, num, code] of rows) {
            await q(`INSERT INTO entity_poly_seq (entity_id, entry_id, num, mon_id)
                     VALUES ($1, 'ZZ01', $2, $3)`, [entity, num, code]);
        }
        return work(q);
    });
}

// The rule migration 010 stores and load_cif.py writes, run on the fixture.
async function stored_flag(q) {
    let r = await q(`SELECT EXISTS (
        SELECT 1 FROM entity_poly_seq eps
        JOIN entity_poly ep ON ep.entry_id = eps.entry_id AND ep.entity_id = eps.entity_id
        JOIN chem_comp cc ON cc.id = eps.mon_id
        WHERE eps.entry_id = 'ZZ01' AND ep.type ILIKE '%nucleotide%'
          AND cc.mon_nstd_flag = 'n') AS v`);
    return r.rows[0].v;
}

test("a modified protein residue does not flag the entry", async () => {
    let v = await with_residues([["1", 1, "MSE"]], stored_flag);
    assert.equal(v, false);
});

test("a modified RNA residue flags the entry", async () => {
    let v = await with_residues([["1", 1, "MSE"], ["2", 1, "PSU"]], stored_flag);
    assert.equal(v, true);
});

test("the residue list shows nucleotide modifications, not protein ones", async () => {
    let v = await with_residues([["1", 1, "MSE"], ["2", 1, "PSU"]], async (q) => {
        await q(`REFRESH MATERIALIZED VIEW doc`);   // the list is stored there
        return column_of("nonstandard_residue", "ZZ01", q);
    });
    assert.equal(v, "PSU");
});

test("the residue filter does not find an entry by a protein modification", async () => {
    let [mse, psu] = await with_residues([["1", 1, "MSE"], ["2", 1, "PSU"]], async (q) =>
        [await matches({ nonstandard_residue: "MSE" }, q),
         await matches({ nonstandard_residue: "PSU" }, q)]);
    assert.ok(!mse.includes("ZZ01"));
    assert.ok(psu.includes("ZZ01"));
});

// --- source organism from every entity (micro-goal 1.9) -----------------

async function organism_of(rows) {
    return with_fixture(async (q) => {
        for (let [entity, name] of rows) {
            await q(`INSERT INTO entity_src_gen (entity_id, entry_id, pdbx_gene_src_scientific_name)
                     VALUES ($1, 'ZZ01', $2)`, [entity, name]);
        }
        return column_of("source_organism", "ZZ01", q);
    });
}

test("the organism shows when only a later entity records it", async () => {
    assert.equal(await organism_of([["2", "Bean pod mottle virus"]]), "Bean pod mottle virus");
});

test("every organism shows, in entity order", async () => {
    let v = await organism_of([["10", "Homo sapiens"], ["2", "Escherichia coli"],
                               ["3", "Thermus aquaticus"]]);
    assert.equal(v, "Escherichia coli; Thermus aquaticus; Homo sapiens");
});

test("an organism spelt in two cases shows once, not in capitals", async () => {
    let v = await organism_of([["1", "ESCHERICHIA COLI"], ["2", "Escherichia coli"]]);
    assert.equal(v, "Escherichia coli");
});

test("no organism is blank in the data and 'Not recorded' on the page", async () => {
    let v = await organism_of([]);
    assert.equal(v, "");
    let row = detail_rows({ source_organism: v }, "card")
        .find((r) => r.label === "Source organism");
    assert.equal(row.value, "Not recorded");
});

test("a capitals-only organism reads in species case on the card, as stored in the data", async () => {
    let v = await organism_of([["1", "SACCHAROMYCES CEREVISIAE"], ["2", "HEPATITIS C VIRUS"]]);
    assert.equal(v, "SACCHAROMYCES CEREVISIAE; HEPATITIS C VIRUS");
    let row = detail_rows({ source_organism: v }, "card")
        .find((r) => r.label === "Source organism");
    assert.equal(row.value, "Saccharomyces cerevisiae; HEPATITIS C VIRUS");
});

// --- organism, taxon, how obtained and host as search filters (L7) --------

// ZZ02: a natural yeast RNA and an E. coli-made Thermus protein.
const YEAST_AND_THERMUS = [["nat", "1", 1, "Saccharomyces cerevisiae", 4932],
                           ["gen", "2", 1, "Thermus aquaticus", 271, "Escherichia coli", 562]];
const finds = (params, rows = YEAST_AND_THERMUS) =>
    with_sources(rows, async (q) => (await matches(params, q)).includes("ZZ02"));

test("the organism filter finds natural and synthetic sources, not only expressed", async () => {
    assert.equal(await finds({ source_organism: "cerevisiae" }), true);
    assert.equal(await finds({ source_organism: "Homo" }, [["syn", "1", 1, "Homo sapiens", 9606]]), true);
    assert.equal(await finds({ source_organism: "aquaticus" }), true);
});

test("the expression host is its own filter and does not answer the organism one", async () => {
    assert.equal(await finds({ source_organism: "Escherichia" }), false);
    assert.equal(await finds({ expression_host: "Escherichia" }), true);
    assert.equal(await finds({ expression_host: "Saccharomyces" }), false);
});

test("the taxonomy ID is matched exactly, and junk matches nothing", async () => {
    assert.equal(await finds({ taxonomy_id: "4932" }), true);
    assert.equal(await finds({ taxonomy_id: "493" }), false);
    assert.equal(await finds({ taxonomy_id: "562" }), false);
    assert.equal(await finds({ taxonomy_id: "abc" }), false);
    assert.equal(await finds({ taxonomy_id: "99999999999" }), false);
});

test("Obtained matches any kind the entry has", async () => {
    assert.equal(await finds({ source_kind: ["Natural"] }), true);
    assert.equal(await finds({ source_kind: ["Expressed"] }), true);
    assert.equal(await finds({ source_kind: ["Synthetic"] }), false);
    assert.equal(await finds({ source_kind: ["Synthetic", "Natural"] }), true);
});

test("Obtained 'Not recorded' finds an entry with a polymer that has no source", async () => {
    assert.equal(await finds({ source_kind: ["Not recorded"] }, [["nat", "1", 1, "Homo sapiens", 9606]]), true);
    assert.equal(await finds({ source_kind: ["Not recorded"] }), false);
});

test("the search box finds an organism held only as a natural source", async () => {
    let found = await with_sources([["nat", "1", 1, "Saccharomyces cerevisiae", 4932]], async (q) => {
        await q("REFRESH MATERIALIZED VIEW doc");
        return (await matches({ q: "cerevisiae" }, q)).includes("ZZ02");
    });
    assert.equal(found, true);
});

test("the Source organism row lists every kind, and the card columns say why a filter matched", async () => {
    let v = await with_sources(YEAST_AND_THERMUS, async (q) => ({
        organism: await column_of("source_organism", "ZZ02", q),
        kind:     await column_of("source_kind", "ZZ02", q),
        host:     await column_of("expression_host", "ZZ02", q),
        taxa:     await column_of("source_taxonomy", "ZZ02", q)
    }));
    assert.deepEqual(v, { organism: "Saccharomyces cerevisiae; Thermus aquaticus",
                          kind: "Natural, Expressed", host: "Escherichia coli", taxa: "271, 4932" });
});

test("each new filter puts its own row on the card", () => {
    assert.deepEqual(columns_answering({ taxonomy_id: "4932", source_kind: ["Natural"],
                                         expression_host: "coli" }).sort(),
                     ["expression_host", "source_kind", "source_taxonomy"]);
});

// --- resolution from refine, as the PDB reports it (micro-goal 1.10) ----

async function with_resolution(refine, reflns, work) {
    return with_fixture(async (q) => {
        if (refine !== null) await q(`INSERT INTO refine (entry_id, pdbx_refine_id, ls_d_res_high)
                                      VALUES ('ZZ01', 'X-RAY DIFFRACTION', $1)`, [refine]);
        if (reflns !== null) await q(`INSERT INTO reflns (entry_id, d_resolution_high)
                                      VALUES ('ZZ01', $1)`, [reflns]);
        return work(q);
    });
}

// The column reads tables ENTRY_JOINS brings in; the sort carries the same.
async function resolution_of(q) {
    let join = SORTS.find((s) => s.key === "resolution_asc").join;
    let select = COLUMNS.find((c) => c.key === "resolution").select;
    return (await q(`SELECT ${select} AS v FROM entry e ${join} WHERE e.id = 'ZZ01'`)).rows[0].v;
}

test("Resolution is refine's when both tables record one", async () => {
    let v = await with_resolution(3.75, 2.91, resolution_of);
    assert.equal(v, 3.75);
});

test("Resolution comes from refine when reflns has none, as in EM entries", async () => {
    let v = await with_resolution(3.2, null, resolution_of);
    assert.equal(Number(v.toFixed(2)), 3.2);
});

test("Resolution falls back to reflns when refine has none", async () => {
    let v = await with_resolution(null, 2.5, resolution_of);
    assert.equal(v, 2.5);
});

test("the resolution sort orders by the same value the card shows", async () => {
    let sort = SORTS.find((s) => s.key === "resolution_asc");
    let first = await with_resolution(0.1, 9.9, async (q) =>
        (await q(`SELECT e.id FROM entry e ${sort.join}
                  ORDER BY ${sort.sql}, e.id LIMIT 1`)).rows[0].id);
    assert.equal(first, "ZZ01");
});

// --- every citation (micro-goal 1.11) -----------------------------------

async function with_citations(work) {
    return with_fixture(async (q) => {
        await q(`INSERT INTO citation (id, entry_id, title, journal_abbrev, journal_volume,
                                       page_first, page_last, year,
                                       pdbx_database_id_doi, pdbx_database_id_pubmed) VALUES
                 ('10', 'ZZ01', 'Later work', 'Nature', NULL, NULL, NULL, 2005, NULL, NULL),
                 ('1', 'ZZ01', E'Manganese\n  binding sites', 'J.Mol.Biol.', '262', '1', '12',
                  1996, '10.1006/jmbi.1996.0408', 8893856),
                 ('primary', 'ZZ01', 'The structure', 'Nucleic Acids Res.', '28', '1969', NULL,
                  2000, NULL, 10756198)`);
        await q(`INSERT INTO citation_author (entry_id, citation_id, name, ordinal) VALUES
                 ('ZZ01', 'primary', 'Second, B.', 2), ('ZZ01', 'primary', 'First, A.', 1),
                 ('ZZ01', '1', 'Other, C.', 1)`);
        return work(q);
    });
}

test("every citation is listed, the primary first, then by id as a number", async () => {
    let c = await with_citations((q) => entry_citations("zz01", q));
    assert.deepEqual(c.map((x) => x.id), ["primary", "1", "10"]);
    assert.deepEqual(c.map((x) => x.primary), [true, false, false]);
});

test("a citation's authors keep their order", async () => {
    let c = await with_citations((q) => entry_citations("ZZ01", q));
    assert.deepEqual(c[0].authors, ["First, A.", "Second, B."]);
    assert.deepEqual(c[2].authors, []);
});

test("a citation carries its title, pages and working links", async () => {
    let c = await with_citations((q) => entry_citations("ZZ01", q));
    assert.equal(c[1].title, "Manganese binding sites");
    assert.equal(c[1].pages, "1-12");
    assert.equal(c[1].doi_url, "https://doi.org/10.1006/jmbi.1996.0408");
    assert.equal(c[1].pubmed_url, "https://pubmed.ncbi.nlm.nih.gov/8893856/");
    assert.equal(c[0].pages, "1969");
    assert.equal(c[0].doi_url, null);
    assert.equal(c[2].pages, null);
});

test("an entry with no citation lists none", async () => {
    assert.deepEqual(await with_fixture((q) => entry_citations("ZZ01", q)), []);
});

// --- the search document, nucleotides only (micro-goal 1.12) ------------
// doc is a materialized view, so the fixture rebuilds it inside the
// transaction; the rollback puts the old one back.

test("the search document holds modified nucleotides, not protein ones", async () => {
    let row = await with_residues([["1", 1, "MSE"], ["2", 1, "PSU"]], async (q) => {
        await q(`REFRESH MATERIALIZED VIEW doc`);
        return (await q(`SELECT residues, residue_codes FROM doc WHERE id = 'ZZ01'`)).rows[0];
    });
    assert.match(row.residues, /^PSU\b/);
    assert.doesNotMatch(row.residues, /MSE/);
    assert.equal(row.residue_codes, "PSU");
});

test("the box and the residue filter agree on a protein modification", async () => {
    let [box, filter] = await with_residues([["1", 1, "MSE"]], async (q) => {
        await q(`REFRESH MATERIALIZED VIEW doc`);
        return [await matches({ q: "MSE" }, q), await matches({ nonstandard_residue: "MSE" }, q)];
    });
    assert.equal(box.includes("ZZ01"), filter.includes("ZZ01"));
    assert.ok(!box.includes("ZZ01"));
});

// --- the Molecules table (micro-goal 2.1a) ------------------------------
// ZZ02 is 1L9A in miniature: an RNA numbered from 112 with two residues
// missing, a protein, magnesium and water. Author chains swapped, as there.

async function with_molecules(work) {
    return with_fixture(async (q) => {
        await q(`INSERT INTO entry (id) VALUES ('ZZ02')`);
        await q(`INSERT INTO entity (id, entry_id, type, pdbx_description) VALUES
                 ('1', 'ZZ02', 'polymer', 'SRP RNA'), ('2', 'ZZ02', 'polymer', 'SRP19'),
                 ('3', 'ZZ02', 'non-polymer', 'MAGNESIUM ION'), ('4', 'ZZ02', 'water', 'water')`);
        await q(`INSERT INTO entity_poly (entity_id, entry_id, type, pdbx_seq_one_letter_code_can) VALUES
                 ('1', 'ZZ02', 'polyribonucleotide', 'GCAGU'), ('2', 'ZZ02', 'polypeptide(L)', 'MK')`);
        await q(`INSERT INTO pdbx_entity_nonpoly (entity_id, entry_id, name, comp_id)
                 VALUES ('3', 'ZZ02', 'MAGNESIUM ION', 'MG')`);
        await q(`INSERT INTO struct_asym (id, entry_id, entity_id) VALUES
                 ('A', 'ZZ02', '1'), ('B', 'ZZ02', '2'), ('C', 'ZZ02', '3'), ('D', 'ZZ02', '3'),
                 ('E', 'ZZ02', '4')`);
        // seq 3 and 4 were in the sequence but not seen: no auth_mon_id.
        // seq 5 has two alternative residues and counts once.
        await q(`INSERT INTO pdbx_poly_seq_scheme (asym_id, entry_id, entity_id, seq_id, mon_id,
                                                   pdb_seq_num, auth_mon_id, pdb_strand_id) VALUES
                 ('A', 'ZZ02', '1', 1, 'G', 112, 'G',  'B'),
                 ('A', 'ZZ02', '1', 2, 'C', 113, 'C',  'B'),
                 ('A', 'ZZ02', '1', 3, 'A', 114, NULL, 'B'),
                 ('A', 'ZZ02', '1', 4, 'G', 115, NULL, 'B'),
                 ('A', 'ZZ02', '1', 5, 'U', 116, 'U',  'B'),
                 ('A', 'ZZ02', '1', 5, 'C', 116, 'C',  'B'),
                 ('B', 'ZZ02', '2', 1, 'MET', 1, 'MET', 'A'),
                 ('B', 'ZZ02', '2', 2, 'LYS', 2, 'LYS', 'A')`);
        return work(q);
    });
}

test("each chain says how much of it is modelled and where", async () => {
    let c = await with_molecules((q) => entry_contents("ZZ02", q));
    let rna = c.entities.find((e) => e.id === "1").chains[0];
    assert.equal(rna.auth, "B");
    assert.equal(rna.total, 5);
    assert.equal(rna.modelled, 3);
    assert.equal(rna.first, "112");
    assert.equal(rna.last, "116");
    assert.deepEqual(rna.missing, [{ from: "114", from_mon: "A", to: "115", to_mon: "G", count: 2 }]);
});

test("missing residues group into runs of consecutive positions", () => {
    let runs = missing_runs([{ seq: 1, num: "1", mon: "U" }, { seq: 5, num: "5", mon: "A" },
                             { seq: 6, num: "6", mon: "G" }, { seq: 7, num: "7", mon: "C" }]);
    assert.deepEqual(runs.map((r) => [r.from, r.to, r.count]), [["1", "1", 1], ["5", "7", 3]]);
});

test("the Molecules table lists nucleic acids first and leaves out water", async () => {
    let m = await with_molecules(async (q) => molecule_groups(await entry_contents("ZZ02", q)));
    assert.deepEqual(m.groups.map((g) => g.title), ["RNA", "Protein", "Ligands"]);
    assert.equal(m.summary, "1 RNA · 1 protein · 1 ligand");
});

test("a polymer row reads the way 1L9A's does", async () => {
    let m = await with_molecules(async (q) => molecule_groups(await entry_contents("ZZ02", q)));
    assert.deepEqual(m.groups[0].rows[0], {
        name: "SRP RNA", length: "5 nt",
        chains: [{ name: "B", title: "label id A" }],
        modelled: "3 / 5", missing: "A114, G115", numbering: "112–116",
        links: []
    });
    assert.equal(m.groups[1].rows[0].length, "2 aa");
});

test("a ligand row gives its code and how many copies", async () => {
    let m = await with_molecules(async (q) => molecule_groups(await entry_contents("ZZ02", q)));
    assert.deepEqual(m.groups[2].rows, [{ code: "MG", name: "MAGNESIUM ION", count: 2,
                                               url: "https://www.rcsb.org/ligand/MG" }]);
});

// --- links and organism per molecule (micro-goal 2.1b) ------------------

async function with_refs(refs, organisms, work) {
    return with_molecules(async (q) => {
        for (let [i, [entity, db, code, acc]] of refs.entries())
            await q(`INSERT INTO struct_ref (id, entry_id, entity_id, db_name, db_code, pdbx_db_accession)
                     VALUES ($1, 'ZZ02', $2, $3, $4, $5)`, [String(i + 1), entity, db, code, acc]);
        for (let [entity, name] of organisms)
            await q(`INSERT INTO entity_src_gen (entry_id, entity_id, pdbx_gene_src_scientific_name)
                     VALUES ('ZZ02', $1, $2)`, [entity, name]);
        return molecule_groups(await entry_contents("ZZ02", q));
    });
}

test("each database links to its own site, UniProt by accession", async () => {
    let m = await with_refs([["1", "GB", "X04248", "X04248"], ["2", "UNP", "SRP19_METJA", "Q58440"]],
                            [], async (m) => m);
    assert.deepEqual(m.groups[0].rows[0].links,
                     [{ text: "GenBank X04248", url: "https://www.ncbi.nlm.nih.gov/nuccore/X04248" }]);
    assert.deepEqual(m.groups[1].rows[0].links,
                     [{ text: "UniProt Q58440", url: "https://www.uniprot.org/uniprotkb/Q58440" }]);
});

test("a molecule's own PDB entry is not offered as a link", async () => {
    let m = await with_refs([["1", "PDB", "ZZ02", "ZZ02"], ["1", "PDB", "4U53", "4U53"]],
                            [], async (m) => m);
    assert.deepEqual(m.groups[0].rows[0].links.map((l) => l.text), ["PDB 4U53"]);
});

test("every reference is listed, and an unknown database is plain text", async () => {
    let m = await with_refs([["1", "TPG", "BK006945", "BK006945.2"], ["1", "GB", "U53879", "U53879.1"],
                             ["2", "NOR", "NOR00669", "NOR00669"]], [], async (m) => m);
    assert.equal(m.groups[0].rows[0].links.length, 2);
    assert.equal(m.groups[1].rows[0].links[0].url, null);
});

// --- where each polymer came from (L6) ----------------------------------

// rows: [table, entity, src_id, organism, taxid, host, host_taxid, beg, end]
async function with_sources(rows, work = async (q) => molecule_groups(await entry_contents("ZZ02", q))) {
    return with_molecules(async (q) => {
        for (let [table, entity, src, org, taxid, host, host_taxid, beg, end] of rows) {
            if (table === "gen")
                await q(`INSERT INTO entity_src_gen (entry_id, entity_id, pdbx_src_id,
                             pdbx_gene_src_scientific_name, pdbx_gene_src_ncbi_taxonomy_id,
                             pdbx_host_org_scientific_name, pdbx_host_org_ncbi_taxonomy_id,
                             pdbx_beg_seq_num, pdbx_end_seq_num)
                         VALUES ('ZZ02', $1, $2, $3, $4, $5, $6, $7, $8)`,
                        [entity, src, org, taxid, host ?? null, host_taxid ?? null, beg ?? null, end ?? null]);
            else if (table === "nat")
                await q(`INSERT INTO entity_src_nat (entry_id, entity_id, pdbx_src_id,
                             pdbx_organism_scientific, pdbx_ncbi_taxonomy_id)
                         VALUES ('ZZ02', $1, $2, $3, $4)`, [entity, src, org, taxid]);
            else
                await q(`INSERT INTO pdbx_entity_src_syn (entry_id, entity_id, pdbx_src_id,
                             organism_scientific, ncbi_taxonomy_id)
                         VALUES ('ZZ02', $1, $2, $3, $4)`, [entity, src, org, taxid]);
        }
        return work(q);
    });
}

// One row of the Source table as text: kind | organisms | host | notes.
const text = (o) => (o ? o.name + (o.common ? ` (${o.common})` : "") : "—");
const flat = (r) => [r.kind,
    r.segments.map((g) => [g.range, text(g.organism), g.taxon?.id].filter(Boolean).join(" ")).join("; "),
    r.host ? `${text(r.host.organism)} ${r.host.taxon?.id ?? ""}`.trim() : "—",
    r.segments.map((g) => g.notes ?? "").join(";")].join(" | ");

test("a natural tRNA and an expressed protein are two rows with their own columns (1OB5)", async () => {
    let m = await with_sources([["nat", "1", 1, "SACCHAROMYCES CEREVISIAE", 4932],
                                ["gen", "2", 1, "Thermus aquaticus", 271, "Escherichia coli", 562]]);
    assert.deepEqual(m.sources.rows.map(flat), [
        "Natural | Saccharomyces cerevisiae 4932 | — | ",
        "Expressed | Thermus aquaticus 271 | Escherichia coli 562 | "]);
    assert.deepEqual(m.sources.rows[0].molecules, [{ name: "SRP RNA", chains: ["B"] }]);
    assert.equal(m.sources.notes, false);
});

test("the legend says what each word means", async () => {
    let m = await with_sources([]);
    assert.deepEqual(m.sources.legend.map((l) => l.kind), ["Natural", "Expressed", "Synthetic"]);
});

test("organisms are italic and taxon IDs link to NCBI Taxonomy", async () => {
    let m = await with_sources([["nat", "1", 1, "Saccharomyces cerevisiae", 4932]]);
    let seg = m.sources.rows[0].segments[0];
    assert.equal(seg.organism.italic, true);
    assert.equal(seg.taxon.url, "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=4932");
});

test("a host that is the source organism itself is not repeated", async () => {
    let m = await with_sources([["gen", "2", 1, "Bacillus halodurans", 86665, "Bacillus halodurans", 86665]]);
    assert.equal(flat(m.sources.rows[1]), "Expressed | Bacillus halodurans 86665 | — | ");
});

test("molecules with the same source share a row", async () => {
    let m = await with_sources([["syn", "1", 1, "synthetic construct", 32630],
                                ["syn", "2", 1, "synthetic construct", 32630]]);
    assert.equal(m.sources.rows.length, 1);
    assert.deepEqual(m.sources.rows[0].molecules.map((x) => x.name), ["SRP RNA", "SRP19"]);
    assert.equal(m.sources.rows[0].listed, true);
    assert.equal(flat(m.sources.rows[0]), "Synthetic | synthetic construct 32630 | — | ");
});

test("a synthetic molecule names the organism its sequence comes from", async () => {
    let m = await with_sources([["syn", "1", 1, "HOMO SAPIENS", 9606], ["syn", "2", 1, null, null]]);
    assert.deepEqual(m.sources.rows.map(flat), ["Synthetic | Homo sapiens 9606 | — | ",
                                                "Synthetic | — | — | "]);
});

test("a chimera is one row per segment, with the range and one host (3WFR)", async () => {
    let m = await with_sources([
        ["gen", "2", 1, "synthetic construct", 32630, "Escherichia coli", 562, 1, 15],
        ["gen", "2", 2, "Aquifex aeolicus (strain VF5)", 224324, "Escherichia coli", 562, 16, 453]]);
    assert.equal(flat(m.sources.rows[1]),
        "Expressed | 1–15 synthetic construct 32630; 16–453 Aquifex aeolicus (strain VF5) 224324 | Escherichia coli 562 | ;");
});

test("a polymer without a source row is 'Not recorded', and ligands are not listed", async () => {
    let m = await with_sources([]);
    assert.equal(m.sources.rows.length, 1);
    assert.equal(flat(m.sources.rows[0]), "Not recorded | — | — | ");
    assert.equal(m.sources.rows[0].molecules.length, 2);
});

test("notes come from the file, without repeating the organism or tagging a linker", () => {
    let entity = (segments) => ({ type: "polymer", description: "p", chains: [{ label: "A" }],
                                  source: { kind: "Expressed", segments, host: null } });
    let s = source_section([entity([
        { organism: "synthetic construct", taxid: 32630, strain: "VF5", gene: "pcnB2" },
        { organism: "Aquifex aeolicus (strain VF5)", taxid: 224324, strain: "VF5", gene: "pcnB2" },
        { organism: "Trypanosoma brucei", taxid: 5702, strain: "Lister strain 427", details: "procyclic" }])]);
    assert.deepEqual(s.rows[0].segments.map((g) => g.notes),
                     [null, "gene pcnB2", "Lister strain 427; procyclic"]);
    assert.equal(s.notes, true);
});

test("past SOURCE_LISTED molecules a row folds behind a count", () => {
    let polymers = Array.from({ length: SOURCE_LISTED + 1 }, (_, i) => ({
        type: "polymer", description: `uS${i}`, chains: [{ label: String(i) }, { label: `${i}x` }],
        source: { kind: "Natural", segments: [{ organism: "Thermus thermophilus", taxid: 274 }], host: null } }));
    let row = source_section(polymers).rows[0];
    assert.equal(row.listed, false);
    assert.equal(row.chain_count, 2 * (SOURCE_LISTED + 1));
});

test("the Molecules table no longer carries a source line", async () => {
    let m = await with_sources([["nat", "1", 1, "Saccharomyces cerevisiae", 4932]]);
    assert.equal(m.groups[0].rows[0].source, undefined);
});

test("capitals become species case, but a strain keeps its own", () => {
    assert.equal(species_case("SACCHAROMYCES CEREVISIAE (STRAIN ATCC 204508 / S288C)"),
                 "Saccharomyces cerevisiae (STRAIN ATCC 204508 / S288C)");
    assert.equal(species_case("Escherichia coli K-12"), "Escherichia coli K-12");
    assert.equal(species_case("HIV-1"), "HIV-1");
    assert.equal(species_case("THERMUS THERMOPHILUS HB8"), "Thermus thermophilus HB8");
    assert.equal(species_case("HEPATITIS C VIRUS"), "HEPATITIS C VIRUS");
});

test("a long gap reads as a range, and many gaps are cut short", () => {
    let entity = (missing) => ({ entities: [{ kind: "RNA", type: "polymer", description: "r",
        length: 50, chains: [{ label: "A", auth: "A", total: 50, modelled: 40,
                               first: "1", last: "50", missing }] }] });
    let gap = (from, to) => ({ from: String(from), from_mon: "A", to: String(to), to_mon: "U",
                               count: to - from + 1 });
    let row = (missing) => molecule_groups(entity(missing)).groups[0].rows[0];

    assert.equal(row([gap(10, 20)]).missing, "10–20 (11)");
    assert.equal(row([1, 3, 5, 7, 9, 11].map((n) => gap(n, n))).missing,
                 "A1, A3, A5, A7, + 2 more gaps");
});

test("the protein group folds only when it is large", () => {
    let proteins = (n) => ({ entities: Array.from({ length: n }, (_, i) => ({
        kind: "Protein", type: "polymer", description: `p${i}`, length: 10, chains: [] })) });
    assert.equal(molecule_groups(proteins(FOLD_PROTEINS)).groups[0].folded, false);
    assert.equal(molecule_groups(proteins(FOLD_PROTEINS + 1)).groups[0].folded, true);
});

// --- modified nucleotides and where they sit (micro-goal 2.1c) ----------
// ZZ02's RNA (author chain B) gets ZZM at 112, 113 and 116, and ZZN at 114,
// which was not modelled. The protein gets ZZP, which must not be listed.

async function with_modified(work) {
    return with_molecules(async (q) => {
        await q(`INSERT INTO chem_comp (id, name, mon_nstd_flag) VALUES
                 ('ZZM', 'TEST MODIFIED U', 'n'), ('ZZN', 'TEST MODIFIED A', 'n'),
                 ('ZZP', 'TEST MODIFIED MET', 'n')`);
        await q(`UPDATE pdbx_poly_seq_scheme SET mon_id = 'ZZM'
                  WHERE entry_id = 'ZZ02' AND asym_id = 'A' AND seq_id IN (1, 2)`);
        await q(`UPDATE pdbx_poly_seq_scheme SET mon_id = 'ZZM'
                  WHERE entry_id = 'ZZ02' AND asym_id = 'A' AND seq_id = 5 AND mon_id = 'U'`);
        await q(`UPDATE pdbx_poly_seq_scheme SET mon_id = 'ZZN'
                  WHERE entry_id = 'ZZ02' AND asym_id = 'A' AND seq_id = 3`);
        await q(`UPDATE pdbx_poly_seq_scheme SET mon_id = 'ZZP'
                  WHERE entry_id = 'ZZ02' AND asym_id = 'B' AND seq_id = 1`);
        return work(q);
    });
}

test("modified nucleotides are listed per code and chain, in author numbering", async () => {
    let c = await with_modified((q) => entry_contents("ZZ02", q));
    assert.deepEqual(c.modified.map((m) => [m.code, m.auth, m.positions.map((p) => p.num)]),
                     [["ZZM", "B", ["112", "113", "116"]], ["ZZN", "B", ["114"]]]);
});

test("a modification with no coordinates is marked as not modelled", async () => {
    let c = await with_modified((q) => entry_contents("ZZ02", q));
    assert.deepEqual(c.modified.find((m) => m.code === "ZZN").positions, [{ num: "114", seen: false }]);
    assert.ok(c.modified.find((m) => m.code === "ZZM").positions.every((p) => p.seen));
});

test("the modified group sits after the nucleic acids, and only when there is one", async () => {
    let m = await with_modified(async (q) => molecule_groups(await entry_contents("ZZ02", q)));
    assert.deepEqual(m.groups.map((g) => g.title), ["RNA", "Modified nucleotides", "Protein", "Ligands"]);
    let row = m.groups[1].rows[0];
    assert.equal(row.url, "https://www.rcsb.org/ligand/ZZM");
    assert.deepEqual(row.chain, { name: "B", title: "label id A" });
});

test("a long list of positions shows the first few and keeps the rest", () => {
    let positions = Array.from({ length: 12 }, (_, i) => ({ num: String(i + 1), seen: true }));
    let m = molecule_groups({ entities: [], modified: [{ code: "PSU", name: "p", label: "A", auth: "A", positions }] });
    let row = m.groups[0].rows[0];
    assert.equal(row.shown.length, POSITIONS_SHOWN);
    assert.equal(row.rest.length, 12 - POSITIONS_SHOWN);
});


// --- base pairs (2.1d) ---------------------------------------------------

// ZZ03 with the given pairs, each [model, chain_1, comp_1, seq_1, chain_2,
// comp_2, seq_2, family]. 5MC and PSU name their parents, as migration 014
// fills them in na3db.
async function with_pairs(rows, work = (q) => entry_base_pairs("ZZ03", q)) {
    let result;
    try {
        await transaction(async (q) => {
            await q(`INSERT INTO entry (id) VALUES ('ZZ03')`);
            await q(`INSERT INTO chem_comp (id, mon_nstd_flag, parent_comp_id) VALUES ('5MC', 'n', 'C'), ('PSU', 'n', 'U')
                     ON CONFLICT (id) DO UPDATE SET parent_comp_id = EXCLUDED.parent_comp_id`);
            for (const [i, [model, c1, r1, n1, c2, r2, n2, family]] of rows.entries()) {
                await q(`INSERT INTO ndb_base_pair_list (base_pair_id, entry_id, pdb_model_number,
                             auth_asym_id_1, comp_id_1, auth_seq_id_1, seq_id_1,
                             auth_asym_id_2, comp_id_2, auth_seq_id_2, seq_id_2)
                         VALUES ($1, 'ZZ03', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                        [i + 1, model, c1, r1, String(n1), n1, c2, r2, String(n2), n2]);
                await q(`INSERT INTO ndb_base_pair_annotation (base_pair_id, entry_id, lw_family, class)
                         VALUES ($1, 'ZZ03', $2, $3)`, [i + 1, family, `${family}_${r1}-${r2}`]);
            }
            result = await work(q);
            throw ROLLBACK;
        });
    } catch (err) {
        if (err !== ROLLBACK) throw err;
    }
    return result;
}

const kinds = (pairs) => pairs.map((p) => `${p.res_1}-${p.res_2} ${p.kind}`);

test("a pair with a modified base is judged on its parent: G-5MC is Watson-Crick", async () => {
    let pairs = await with_pairs([[1, "B", "G", 30, "B", "5MC", 40, "cWW"],
                                  [1, "B", "A", 31, "B", "PSU", 39, "cWW"],
                                  [1, "B", "G", 4,  "B", "U", 69,   "cWW"],
                                  [1, "B", "M2G", 26, "B", "A", 44, "cWW"],
                                  [1, "B", "G", 15, "B", "C", 48,   "tWW"]]);
    assert.deepEqual(kinds(pairs), ["G4-U69 gu", "G15-C48 nc", "M2G26-A44 nc", "G30-5MC40 wc", "A31-PSU39 wc"]);
});

test("DNA pairs drop the D: DG-DC is Watson-Crick, DG-DT is a wobble", async () => {
    let pairs = await with_pairs([[1, "A", "DG", 1, "B", "DC", 12, "cWW"],
                                  [1, "A", "DA", 2, "B", "DT", 11, "cWW"],
                                  [1, "A", "DG", 3, "B", "DT", 10, "cWW"]]);
    assert.deepEqual(pairs.map((p) => p.kind), ["wc", "wc", "gu"]);
});

test("an NMR entry counts its first model only", async () => {
    let pairs = await with_pairs([[1, "A", "G", 1, "A", "C", 9, "cWW"],
                                  [2, "A", "G", 1, "A", "C", 9, "cWW"],
                                  [3, "A", "G", 1, "A", "C", 9, "cWW"]]);
    assert.equal(pairs.length, 1);
});

test("an entry with no pairs has no section", async () => {
    assert.equal(base_pair_section(await with_pairs([])), null);
});

const pair = (c1, c2, kind, family = kind === "nc" ? "tWH" : "cWW") =>
    ({ chain_1: c1, chain_2: c2, kind, family, res_1: "G1", res_2: "C2" });

test("the bar counts the three kinds and the chips only the non-canonical families", () => {
    let s = base_pair_section([pair("B", "B", "wc"), pair("B", "B", "wc"), pair("B", "B", "gu"),
                               pair("B", "B", "nc", "tSS"), pair("B", "B", "nc", "cWW"),
                               pair("B", "B", "nc", "cWW")]);
    assert.equal(s.total, 6);
    assert.deepEqual(s.bar.map((b) => [b.kind, b.n]), [["wc", 2], ["gu", 1], ["nc", 3]]);
    assert.deepEqual(s.families.map((f) => [f.family, f.n, f.mismatch]), [["cWW", 2, true], ["tSS", 1, false]]);
    assert.equal(s.families[1].name, "trans sugar / sugar");
    assert.equal(s.families.reduce((n, f) => n + f.n, 0), s.bar[2].n);
    assert.equal(s.noncanonical.length, 3);
});

test("copies that each fold on themselves read as one sentence", () => {
    let same = base_pair_section(["B", "D", "F"].flatMap((c) => [pair(c, c, "wc"), pair(c, c, "nc")]));
    assert.equal(same.sentence, "Chains B, D and F each pair only with themselves, 2 pairs each.");
    let one = base_pair_section([pair("A", "A", "wc")]);
    assert.equal(one.sentence, "Chain A pairs only with itself.");
    let differ = base_pair_section([pair("A", "A", "wc"), pair("B", "B", "wc"), pair("B", "B", "wc")]);
    assert.equal(differ.sentence, "Chains A and B each pair only with themselves (A 1, B 2).");
});

test("a duplex lists its pairing once, whichever strand is written first", () => {
    let s = base_pair_section([pair("A", "B", "wc"), pair("B", "A", "wc"), pair("A", "A", "nc")]);
    assert.equal(s.sentence, null);
    assert.deepEqual(s.links.map((l) => [l.text, l.n]), [["A with B: 2 pairs", 2], ["A with itself: 1 pair", 1]]);
    assert.equal(s.noncanonical[0].chain, "A");
    assert.equal(base_pair_section([pair("A", "B", "nc")]).noncanonical[0].chain, "A / B");
});

test("many self-paired chains are counted, not named", () => {
    let chains = Array.from({ length: PAIR_LINKS_SHOWN + 1 }, (_, i) => `C${i}`);
    let s = base_pair_section(chains.map((c) => pair(c, c, "wc")));
    assert.equal(s.sentence, `${chains.length} chains each pair only with themselves, 1 pair each.`);
});
