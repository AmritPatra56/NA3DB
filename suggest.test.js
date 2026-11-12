// suggest.test.js - "Did you mean" for a search that found nothing.

import test, { after } from "node:test";
import assert from "node:assert";
import { close } from "./db.js";
import { count_entries } from "./search.js";
import { did_you_mean, distance, closest, box_suggestions, word_start } from "./suggest.js";
import { search_entries } from "./search.js";
import { query } from "./db.js";

after(() => close());


test("distance counts one slip per change, and a swap of neighbours as one", () => {
    assert.equal(distance("ribozome", "ribosome", 2), 1);
    assert.equal(distance("tnra", "trna", 2), 1);
    assert.equal(distance("aptmer", "aptamer", 2), 1);
    assert.equal(distance("abc", "abc", 2), 0);
    assert.equal(distance("abcdef", "uvwxyz", 2), 3, "stops counting past the cap");
});

test("only the fewest slips are offered, and never a word holding another offer", () => {
    let words = new Map([["nucleosome", 5], ["nuclease", 9], ["ribosome", 9], ["ribosomes", 4],
                         ["quadruplex", 3], ["gquadruplex", 8]]);
    assert.deepEqual(closest("nucleosme", words).map((c) => c.w), ["nucleosome"]);
    assert.deepEqual(closest("ribozome", words).map((c) => c.w), ["ribosome"]);
    assert.deepEqual(closest("quadraplex", words).map((c) => c.w), ["quadruplex"]);
});

test("a misspelt word is offered as the word the database holds, with its real count", async () => {
    let offers = await did_you_mean({ q: "ribozome" });
    assert.equal(offers[0].value, "ribosome");
    assert.equal(offers[0].total, await count_entries({ q: "ribosome" }));
});

test("the rest of the search is kept as typed: case, quotes and other words", async () => {
    assert.equal((await did_you_mean({ q: "Ribozome" }))[0].value, "Ribosome");
    assert.equal((await did_you_mean({ q: "\"ribozome\"" }))[0].value, "\"ribosome\"");
    assert.equal((await did_you_mean({ q: "polymerse" }))[0].value, "polymerase");
});

// Every other filter stays on, so the count is what the link will show, and a
// fix that would still find nothing is not offered at all.
test("other filters stay on, and an offer that finds nothing is dropped", async () => {
    let em = { q: "ribozome", experimental_method: "ELECTRON MICROSCOPY" };
    let offer = (await did_you_mean(em))[0];
    assert.equal(offer.total, await count_entries({ ...em, q: offer.value }));

    let xray = { q: "ribozome", experimental_method: "X-RAY DIFFRACTION" };
    assert.equal(await count_entries({ ...xray, q: "ribosome" }), 0);
    assert.deepEqual(await did_you_mean(xray), []);
});

test("nothing is offered for a word that is found, nonsense, or an empty box", async () => {
    assert.deepEqual(await did_you_mean({ q: "ribosome" }), []);
    assert.deepEqual(await did_you_mean({ q: "xyzzy" }), []);
    assert.deepEqual(await did_you_mean({ q: "asdfgh qwerty zxcvb uiop" }), []);
    assert.deepEqual(await did_you_mean({ q: "" }), []);
    assert.deepEqual(await did_you_mean({}), []);
});

test("Excludes offers nothing: finding nothing there is not a typo", async () => {
    assert.deepEqual(await did_you_mean({ q: "ribozome", match: "excludes" }), []);
});


// --- suggestions under the search box ---------------------------------------

const offers = async (params) => (await box_suggestions(params)).groups;

// Typed texts the test data answers: authors, organisms, molecules, an id.
const TYPED = ["gra", "seraj", "west", "mouse", "human", "coli", "trna", "rna", "ribo", "hiv", "dna",
               "psu", "5mc", "omg", "pseudouridine", "methyl", "grsas"];

// The search a pick runs: a code in its own filter, the box emptied, or the
// quoted name in the box.
const picked = (extra, item) => (item.filter ? { ...extra, q: "", [item.filter]: item.value } : { ...extra, q: item.value });

test("every offered count is what searching the offer returns, with other filters kept", async () => {
    let tried = 0;
    for (const extra of [{}, { polymer_type: "RNA" }, { match: "excludes" }]) {
        for (const q of TYPED) {
            for (const group of await offers({ ...extra, q })) {
                for (const item of group.items.filter((i) => !i.href)) {
                    let found = await search_entries(picked(extra, item));
                    assert.equal(item.total, found.total, `${q} -> ${item.value} ${JSON.stringify(extra)}`);
                    assert.ok(item.total > 0, `${item.value} offered with 0`);
                    tried++;
                }
            }
        }
    }
    assert.ok(tried > 20, `only ${tried} offers checked`);
});

test("offers are names the database holds, quoted as typed into the box, at most three a group", async () => {
    let lines = (await query(`SELECT string_agg(authors || E'\\n' || entities, E'\\n') AS t FROM doc`)).rows[0].t
        .split("\n").map((l) => l.trim().toLowerCase());
    let held = new Set(lines);
    for (const q of TYPED) {
        for (const group of await offers({ q })) {
            assert.ok(group.items.length <= (group.kind === "entries" ? 4 : 3));
            for (const item of group.items) {
                if (group.kind === "authors" || group.kind === "molecules") {
                    assert.ok(held.has(item.label.toLowerCase()), `${item.label} is not stored`);
                    assert.equal(item.value, `"${item.label}"`);
                }
            }
        }
    }
});

test("a word is matched where it starts: berman is not Lieberman", async () => {
    assert.equal(word_start("Westhof, E.", "west"), 0);
    assert.equal(word_start("Patterson-West, J.", "west"), 1);
    assert.equal(word_start("Lieberman, P.", "berman"), null);
    assert.equal(word_start("tRNA", "rna"), null);
    for (const q of ["gra", "west", "rna"]) {
        for (const group of await offers({ q })) {
            for (const item of group.items) {
                let words = `${item.label} ${item.also ?? ""}`.toLowerCase().split(/[^a-z0-9]+/);
                assert.ok(words.some((w) => w.startsWith(q)), `${q} offered ${item.label}`);
            }
        }
    }
});

test("a common name offers its organism, read the way the search reads it", async () => {
    let organisms = async (q) => (await offers({ q })).find((g) => g.kind === "organisms")?.items.map((i) => i.label) ?? [];
    // Named whole, it comes first: human is Homo sapiens before any virus.
    assert.equal((await organisms("human"))[0], "Homo sapiens");
    // "mouse-ear cress" is Arabidopsis, which mouse does not mean.
    assert.ok(!(await organisms("mouse")).includes("Arabidopsis thaliana"));
});

test("a typed person offers the stored name: Lukas Grass is Grass, L.M.", async () => {
    let authors = (await offers({ q: "Lukas Grass" })).find((g) => g.kind === "authors");
    assert.deepEqual(authors.items.map((i) => i.label), ["Grass, L.M."]);
    assert.deepEqual(await offers({ q: "Zoe Grass" }), []);
});

test("an id offers the entries it starts, as links", async () => {
    let id = (await query(`SELECT id FROM doc ORDER BY id LIMIT 1`)).rows[0].id;
    let entries = (await offers({ q: id.slice(0, 3) })).find((g) => g.kind === "entries");
    assert.ok(entries.items.some((i) => i.label === id && i.href === `/structure/${id}`));
});

test("nothing is offered under three letters, or once a quote is typed", async () => {
    assert.deepEqual(await offers({ q: "tr" }), []);
    assert.deepEqual(await offers({ q: "\"west" }), []);
    assert.deepEqual(await offers({ q: "“west”" }), []);
    assert.deepEqual(await offers({}), []);
});

test("a modified residue is offered by code or name, and picking it fills its filter", async () => {
    // By name only where chem_comp holds one; the test seed holds none.
    let named = (await query(`SELECT name FROM chem_comp WHERE id = 'PSU'`)).rows[0]?.name;
    for (const q of named ? ["psu", "PSU", "pseudouridine"] : ["psu", "PSU"]) {
        let residues = (await offers({ q })).find((g) => g.kind === "residues");
        let psu = residues?.items.find((i) => i.label === "PSU");
        assert.ok(psu, `${q} did not offer PSU`);
        assert.equal(psu.filter, "nonstandard_residue");
        assert.equal(psu.total, (await search_entries({ nonstandard_residue: "PSU" })).total);
    }
    // Two letters offer only a code typed whole.
    assert.deepEqual(await offers({ q: "ps" }), []);
});

test("a slip offers close spellings, marked as such, and only when nothing starts with the text", async () => {
    let reply = await box_suggestions({ q: "grsas" });
    assert.equal(reply.near, true);
    assert.deepEqual(reply.groups.find((g) => g.kind === "authors").items.map((i) => i.label), ["Grass, L.M."]);
    assert.equal((await box_suggestions({ q: "gras" })).near, undefined);
    // Three letters are too few to guess at: tna is one slip from many words.
    assert.deepEqual(await offers({ q: "xqz" }), []);
});
