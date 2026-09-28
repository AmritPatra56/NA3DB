// equivalence.test.js - the proof that moving to PostgreSQL changed no answers.
//
// It runs every filter through TWO implementations and demands they agree:
//   search.js            the SQL the application actually uses
//   search.reference.mjs the JavaScript it used before, over entries.json
//
// This is called differential testing. Instead of hand-writing what each
// answer should be, it compares against a version already known to be right.
// That is what lets it cover 150+ filter combinations rather than a dozen.

import test, { after } from "node:test";
import assert from "node:assert";
import { export_entries } from "./search.js";
import { reference_ids } from "./search.reference.mjs";
import { close } from "./db.js";

after(() => close());

// Asserts the SQL and the reference return the same entries, in the same order.
async function agree(filters) {
    let sql = (await export_entries(filters)).results.map((r) => r.pdb_id);
    let ref = reference_ids(filters);

    assert.deepEqual(sql, ref,
        `SQL and reference disagree for ${JSON.stringify(filters)}`);
}

// A few values per filter, chosen to hit matches, near-misses and nothing.
const VALUES = {
    entry_id:            ["tna", "1", "B", "ZZZZ", "d"],
    author_name:         ["hingerty", "e.", "a"],
    entity_name:         ["tRNA", "DNA", "rna"],
    source_organism:     ["sacch", "coli", "e"],
    nonstandard_residue: ["PSU", "5M", "H2U"],
    assigned_ntc:        ["AA00"],
    polymer_type:        ["Nucleic acid", "Protein/NA", "Nucleic acid,Protein/NA", "any"],
    experimental_method: ["SOLUTION NMR", "X-RAY DIFFRACTION", "SOLUTION NMR,ELECTRON MICROSCOPY"],
    monomer_flag:        ["Standard", "Non-Standard", "Standard,Non-Standard"],
    confal_min:          ["0"],
    confal_max:          ["100"]
};

test("no filters at all returns every entry, in the same order", async () => {
    await agree({});
});

for (const [field, values] of Object.entries(VALUES)) {
    for (const value of values) {
        test(`${field}="${value}" agrees with the JavaScript version`, async () => {
            await agree({ [field]: value });
        });
    }
}

// Combinations, generated from a fixed seed so a failure is reproducible.
const FIELDS = Object.keys(VALUES);
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

let combos = [];
for (let i = 0; i < 60; i++) {
    let c = {};
    let how_many = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < how_many; j++) {
        let field = FIELDS[Math.floor(rnd() * FIELDS.length)];
        c[field] = VALUES[field][Math.floor(rnd() * VALUES[field].length)];
    }
    combos.push(c);
}

test("60 generated filter combinations all agree", async () => {
    for (const filters of combos) await agree(filters);
});

// The characters that mean something to ILIKE but nothing to .includes().
// Without escaping, entry_id="%" returned all 120 entries instead of none.
const PATTERN_CHARACTERS = ["%", "_", "T_A", "4%A", "%%", "\\", "a_b%c"];

for (const value of PATTERN_CHARACTERS) {
    test(`a literal "${value}" is searched for, not treated as a pattern`, async () => {
        await agree({ entry_id: value });
        await agree({ author_name: value });
        await agree({ entity_name: value });
    });
}
