// contents.test.js - checks entry_contents, which lists every molecule in one
// structure. The test database is flat (one or two entities, no chains), so
// each test builds a fuller structure inside a transaction and rolls it back.

import test, { after } from "node:test";
import assert from "node:assert";
import { transaction, close } from "./db.js";
import { entry_contents } from "./search.js";

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

test("works on the plain test data without a fixture", async () => {
    let c = await entry_contents("4TNA");
    assert.ok(c.entities.length >= 1);
    assert.equal(c.entities[0].kind, "RNA");
});
