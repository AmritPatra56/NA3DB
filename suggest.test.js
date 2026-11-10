// suggest.test.js - "Did you mean" for a search that found nothing.

import test, { after } from "node:test";
import assert from "node:assert";
import { close } from "./db.js";
import { count_entries } from "./search.js";
import { did_you_mean, distance, closest } from "./suggest.js";

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
