import test, { after } from "node:test";
import assert from "node:assert";
import { export_entries } from "./search.js";
import { reference_ids } from "./search.reference.mjs";
import { close } from "./db.js";

after(() => close());

async function agree(filters) {
    let sql = (await export_entries(filters)).results.map((r) => r.pdb_id).sort();
    let ref = reference_ids(filters).slice().sort();

    assert.deepEqual(sql, ref,
        `SQL and reference disagree for ${JSON.stringify(filters)}`);
}

const VALUES = {
    entry_id:            ["tna", "1", "B", "ZZZZ", "d"],
    author_name:         ["hingerty", "e.", "a"],
    entity_name:         ["tRNA", "DNA", "rna"],
    source_organism:     ["sacch", "coli", "e"],
    nonstandard_residue: ["PSU", "5M", "H2U"],
    assigned_ntc:        ["AA00"],
    polymer_type:        ["RNA", "Protein/RNA", "DNA", "RNA,Protein/RNA", "any",
                          "Nucleic acid", "Protein/NA", "Nucleic acid,Protein/NA"],
    experimental_method: ["SOLUTION NMR", "X-RAY DIFFRACTION", "SOLUTION NMR,ELECTRON MICROSCOPY"],
    monomer_flag:        ["Standard", "Non-Standard", "Standard,Non-Standard"],
    confal_min:          ["0"],
    confal_max:          ["100"]
};

test("no filters at all returns every entry", async () => {
    await agree({});
});

for (const [field, values] of Object.entries(VALUES)) {
    for (const value of values) {
        test(`${field}="${value}" agrees with the JavaScript version`, async () => {
            await agree({ [field]: value });
        });
    }
}

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

const PATTERN_CHARACTERS = ["%", "_", "T_A", "4%A", "%%", "\\", "a_b%c"];

for (const value of PATTERN_CHARACTERS) {
    test(`a literal "${value}" is searched for, not treated as a pattern`, async () => {
        await agree({ entry_id: value });
        await agree({ author_name: value });
        await agree({ entity_name: value });
    });
}
