// contents.test.js - checks entry_contents, which lists every molecule in one
// structure. The test database is flat (one or two entities, no chains), so
// each test builds a fuller structure inside a transaction and rolls it back.

import test, { after } from "node:test";
import assert from "node:assert";
import { query, transaction, close } from "./db.js";
import { entry_contents, find_entry, search_entries, build_where } from "./search.js";
import { COLUMNS, FILTERS, ENTITY_NAME_LIMIT } from "./filters.js";
import { detail_rows } from "./detail.js";

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

    assert.deepEqual(rna.chains, [{ label: "B", auth: "R" }, { label: "C", auth: "S" }]);
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
    let v = await with_residues([["1", 1, "MSE"], ["2", 1, "PSU"]],
                                (q) => column_of("nonstandard_residue", "ZZ01", q));
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
