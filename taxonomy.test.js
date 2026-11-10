// taxonomy.test.js - organisms found by the names people use for them.

import test, { after } from "node:test";
import assert from "node:assert";
import { close } from "./db.js";
import { count_entries, export_entries, organism_suggestions } from "./search.js";
import { did_you_mean } from "./suggest.js";
import { taxa_named, name_key } from "./taxonomy.js";

after(() => close());

const ids_for = async (params) => (await export_entries(params)).results.map((e) => e.pdb_id).sort();

// NCBI ids: 10090 mouse, 10116 rat, 9606 human, 562 E. coli, 866768 a strain
// of it, 4932 baker's yeast, 4896 fission yeast, 3702 Arabidopsis (the
// "mouse-ear cress"), 7227 fruit fly, 11676 HIV-1.

test("a common name finds the species", () => {
    assert.ok(taxa_named("mouse").includes(10090));
    assert.ok(taxa_named("house mouse").includes(10090));
    assert.ok(taxa_named("human").includes(9606));
    assert.ok(taxa_named("rat").includes(10116));
    assert.ok(taxa_named("fly").includes(7227));
    assert.ok(taxa_named("HIV").includes(11676), "an acronym, from its first word");
});

test("a common name is matched by its last words, so mouse is not the mouse-ear cress", () => {
    assert.ok(!taxa_named("mouse").includes(3702));
    assert.ok(taxa_named("cress").includes(3702));
});

test("a scientific name is matched whole: Mus is not the rat, once called Mus norvegicus", () => {
    assert.ok(taxa_named("Mus").includes(10090));
    assert.ok(!taxa_named("Mus").includes(10116));
});

test("E. coli is written many ways, and covers its strains", () => {
    let coli = taxa_named("E. coli");
    assert.ok(coli.includes(562));
    assert.ok(coli.includes(866768), "Escherichiacoli 'BL21-Gold(DE3)pLysS AG' is a strain of it");
    assert.deepEqual(taxa_named("e coli"), coli);
    assert.deepEqual(taxa_named("ecoli"), coli);
    assert.deepEqual(taxa_named("Escherichia coli"), coli);
});

test("yeast is both yeasts, and an apostrophe is optional", () => {
    let yeast = taxa_named("yeast");
    assert.ok(yeast.includes(4932) && yeast.includes(4896));
    assert.deepEqual(taxa_named("bakers yeast"), taxa_named("baker's yeast"));
});

test("a name too short to mean anything names nothing", () => {
    assert.deepEqual(taxa_named("co"), []);
    assert.deepEqual(taxa_named(""), []);
    assert.deepEqual(taxa_named(undefined), []);
    assert.equal(name_key("  Müller's  E.coli "), "mullers e coli");
});

test("the organism boxes find a species by its common name", async () => {
    assert.ok((await count_entries({ source_organism: "rabbit" })) > 0);
    assert.deepEqual(await ids_for({ source_organism: "rabbit" }),
                     await ids_for({ source_organism: "Oryctolagus cuniculus" }));
    assert.deepEqual(await ids_for({ expression_host: "E. coli" }),
                     await ids_for({ expression_host: "Escherichia coli" }));
});

test("the search box finds a species by its common name too", async () => {
    let rabbit = await ids_for({ q: "rabbit" });
    let named = await ids_for({ source_organism: "Oryctolagus cuniculus" });
    assert.ok(named.every((id) => rabbit.includes(id)));
});

test("contains and excludes still add up to the whole table with a common name", async () => {
    let all = (await ids_for({})).length;
    for (const params of [{ expression_host: "E. coli" }, { source_organism: "yeast" }, { q: "rabbit" }]) {
        let yes = (await ids_for(params)).length;
        let no = (await ids_for({ ...params, match: "excludes" })).length;
        assert.equal(yes + no, all, JSON.stringify(params));
    }
});

// The number beside a suggestion is what picking it will find, for every one.
test("each organism suggestion's count is what picking it finds", async () => {
    for (const [role, field] of [["expression_hosts", "expression_host"], ["source_organisms", "source_organism"]]) {
        let rows = await organism_suggestions(role);
        assert.ok(rows.length > 0);
        for (const r of rows) {
            assert.equal(await count_entries({ [field]: r.code }), r.entries, `${field} ${r.code}`);
        }
    }
});

test("a suggestion shows the common names beside the scientific one", async () => {
    let rabbit = (await organism_suggestions("source_organisms")).find((r) => r.code === "Oryctolagus cuniculus");
    assert.match(rabbit.name, /rabbit/);
});

test("a misspelt organism is offered as the one we hold, in its own box", async () => {
    let offers = await did_you_mean({ source_organism: "oryctolagus cuniculs" });
    assert.deepEqual(offers[0], { field: "source_organism", value: "Oryctolagus cuniculus",
                                  total: await count_entries({ source_organism: "Oryctolagus cuniculus" }) });
    assert.deepEqual(await did_you_mean({ source_organism: "xyzzy" }), []);
    assert.deepEqual(await did_you_mean({ expression_host: "escherichia colli" })
        .then((o) => o.map((x) => x.value)), ["Escherichia coli"]);
});
