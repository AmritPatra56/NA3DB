// sameseq.test.js - checks compare_chains, which tells what differs between
// two chains of one sequence. No database: small made-up chains whose every
// difference is known.

import test from "node:test";
import assert from "node:assert";
import { compare_chains, sequence_key, best_rank, SAME_FOLD } from "./sameseq.js";

const SEQ = "GGGAAACCC";
const chain = (name, { missing = [], pairs = [], steps = [], codes = {} } = {}) => ({
    name,
    residues: [...SEQ].map((letter, i) => ({
        pos: i + 1, code: codes[i + 1] ?? letter, num: String(i + 1), seen: !missing.includes(i + 1),
        parent: letter, modified: Boolean(codes[i + 1]), chem: codes[i + 1] ? "made up" : null
    })),
    pairs: pairs.map(([pos_1, pos_2, family, kind = family === "cWW" ? "wc" : "nc"]) => ({ pos_1, pos_2, family, kind })),
    steps: steps.map(([pos_1, ntc, cana, confal]) => ({ pos_1, pos_2: pos_1 + 1, ntc, cana, confal }))
});
const STEM = [[1, 9, "cWW"], [2, 8, "cWW"], [3, 7, "cWW"]];
const DASHES = /[—]/;

test("two copies of one chain have no differences", () => {
    let a = chain("1ABC A", { pairs: STEM, steps: [[1, "AA00", "AAA", 80]] });
    let c = compare_chains(a, chain("2DEF B", { pairs: STEM, steps: [[1, "AA00", "AAA", 90]] }));
    assert.equal(c.summary.verdict, "same");
    assert.equal(c.summary.headline, "No differences");
    assert.equal(c.diffs.length, 0);
    assert.equal(c.summary.shared, 3);
    assert.deepEqual(c.rows.map((r) => r.text), ["(((...)))"]);
    assert.ok(c.rows[0].pairs.every((p) => p[2] === "="));
});

test("a pair only in one chain is a numbered difference, marked on its side", () => {
    let a = chain("A1", { pairs: [...STEM, [4, 6, "tWH"]] });
    let c = compare_chains(a, chain("B1", { pairs: STEM }));
    assert.equal(c.summary.only_a, 1);
    assert.equal(c.diffs.length, 1);
    assert.equal(c.diffs[0].n, 1);
    assert.equal(c.diffs[0].kind, "pair_a");
    assert.equal(c.diffs[0].text, "A4 and A6 pair only in A1.");
    let row = c.rows.find((r) => r.family === "tWH");
    assert.deepEqual(row.pairs, [[3, 5, "a"]]);
    // The same the other way round.
    let back = compare_chains(chain("B1", { pairs: STEM }), a);
    assert.equal(back.diffs[0].kind, "pair_b");
    assert.equal(back.rows.find((r) => r.family === "tWH").pairs[0][2], "b");
});

test("a pair the other chain cannot have, its nucleotide unmodelled, is not a difference", () => {
    let a = chain("A1", { pairs: STEM });
    let c = compare_chains(a, chain("B1", { pairs: STEM.slice(1), missing: [9] }));
    assert.equal(c.diffs.length, 0);
    assert.equal(c.summary.not_comparable, 1);
    assert.equal(c.summary.unmodelled_b, 1);
    assert.equal(c.rows[0].pairs.find((p) => p[0] === 0)[2], "n");
    assert.ok(c.summary.facts.includes("B1 does not model 1 nucleotide"));
});

test("the same two bases paired another way is one difference", () => {
    let a = chain("A1", { pairs: [...STEM, [4, 6, "tWH"]] });
    let c = compare_chains(a, chain("B1", { pairs: [...STEM, [6, 4, "tHW"]] }));
    // 6-4 tHW read from 4 is tWH: the same pair, no difference.
    assert.equal(c.diffs.length, 0);
    let d = compare_chains(a, chain("B1", { pairs: [...STEM, [4, 6, "cSS"]] }));
    assert.equal(d.diffs.length, 1);
    assert.equal(d.diffs[0].kind, "pair_changed");
    assert.match(d.diffs[0].detail, /A1: tWH · B1: cSS/);
});

test("a pair listed twice in one chain counts once", () => {
    let c = compare_chains(chain("A1", { pairs: [...STEM, [9, 1, "cWW"]] }), chain("B1", { pairs: STEM }));
    assert.equal(c.summary.shared, 3);
    assert.equal(c.diffs.length, 0);
});

test("a backbone step differs only when both are sure of their class", () => {
    let a = chain("A1", { steps: [[1, "AA00", "AAA", 80], [2, "AA00", "AAA", 40], [3, "AA00", "AAA", 80], [4, "AA00", "AAA", 80]] });
    let b = chain("B1", { steps: [[1, "BB00", "BBB", 70], [2, "BB00", "BBB", 90], [3, "NANT", "NAN", 0], [4, "AA08", "AAA", 60]] });
    let c = compare_chains(a, b);
    // 1: both sure, A-form vs B-form. 2: A1 unsure. 3: B1 unassigned. 4: same class.
    assert.equal(c.diffs.length, 1);
    assert.equal(c.diffs[0].kind, "step");
    assert.equal(c.diffs[0].i, 0);
    assert.equal(c.summary.steps_compared, 3);
    assert.equal(c.summary.steps_differ, 1);
    assert.equal(c.diffs[0].text, "The backbone from G1 to G2 takes another shape.");
    assert.equal(c.diffs[0].detail, "A1: A-form family, AAA (AA00, confal 80) · B1: B-form family, BBB (BB00, confal 70)");
    let near = compare_chains(chain("A1", { steps: [[1, "AA00", "AAA", 80]] }), chain("B1", { steps: [[1, "AA06", "AAw", 80]] }));
    assert.equal(near.diffs[0].text, "The backbone from G1 to G2 differs slightly, A-form family in both.");
    assert.equal(near.diffs[0].detail, "A1: AAA (AA00, confal 80) · B1: AAw (AA06, confal 80)");
});

test("a step to a nucleotide that is not the next one is left out", () => {
    let a = chain("A1");
    a.steps = [{ pos_1: 1, pos_2: 3, ntc: "AA00", cana: "AAA", confal: 80 }];
    let c = compare_chains(a, chain("B1", { steps: [[1, "BB00", "BBB", 80]] }));
    assert.equal(c.steps.a.length, 0);
    assert.equal(c.diffs.length, 0);
});

test("the first alternate of a step is the one compared", () => {
    let a = chain("A1", { steps: [[1, "AA00", "AAA", 80], [1, "BB00", "BBB", 80]] });
    let c = compare_chains(a, chain("B1", { steps: [[1, "AA00", "AAA", 80]] }));
    assert.equal(c.diffs.length, 0);
    assert.deepEqual(c.steps.a, [[0, "AAA", 80, "AA00"]]);
});

test("a modified nucleotide in one chain is a chemistry difference", () => {
    let c = compare_chains(chain("A1", { pairs: STEM }), chain("B1", { pairs: STEM, codes: { 5: "8AN" } }));
    assert.equal(c.diffs.length, 1);
    assert.equal(c.diffs[0].kind, "chem");
    assert.equal(c.diffs[0].text, "A5 is a different nucleotide.");
    assert.match(c.diffs[0].detail, /A1: A · B1: 8AN \(made up\)/);
    assert.equal(c.cols[4][0], "a", "lower case: modified in one of them");
    assert.equal(c.summary.verdict, "same_fold");
});

test("differences are numbered along the sequence", () => {
    let a = chain("A1", { pairs: [...STEM, [4, 6, "tWH"]], steps: [[1, "AA00", "AAA", 80]] });
    let b = chain("B1", { pairs: STEM.slice(0, 2), codes: { 2: "PSU" }, steps: [[1, "BB00", "BBB", 80]] });
    let c = compare_chains(a, b);
    assert.deepEqual(c.diffs.map((d) => [d.n, d.kind, d.i]),
                     [[1, "step", 0], [2, "chem", 1], [3, "pair_a", 2], [4, "pair_a", 3]]);
});

test("same fold needs most pairs in both", () => {
    // Eighteen pairs of G1 with C9, one per family, are eighteen pairs to compare.
    let pairs = ["cWW", "tWW", "cWH", "cHW", "tWH", "tHW", "cWS", "cSW", "tWS", "tSW",
                 "cHH", "tHH", "cHS", "cSH", "tHS", "tSH", "cSS", "tSS"].map((f) => [1, 9, f]);
    let keep = Math.ceil(pairs.length * SAME_FOLD);
    let c = compare_chains(chain("A1", { pairs }), chain("B1", { pairs: pairs.slice(0, keep) }));
    assert.equal(c.summary.verdict, "same_fold");
    let d = compare_chains(chain("A1", { pairs }), chain("B1", { pairs: pairs.slice(0, keep - 2) }));
    assert.equal(d.summary.verdict, "different_fold");
    assert.match(d.summary.headline, /^Different fold, 1 difference$/);
    assert.equal(d.diffs[0].text, "G1 and C9 pair in both, and also another way in A1.");
});

test("chains with no pairs at all say so", () => {
    let c = compare_chains(chain("A1", { codes: { 3: "5MC" } }), chain("B1"));
    assert.equal(c.summary.verdict, "no_pairs");
    assert.equal(c.summary.headline, "1 difference, no base pairs to compare");
});

test("a nucleotide is named by its author number when both chains share it", () => {
    let a = chain("A1", { codes: { 2: "PSU", 4: "5MC" } });
    a.residues.forEach((r) => { r.num = String(r.pos + 10); });
    let b = chain("B1");
    b.residues.forEach((r) => { r.num = r.pos === 4 ? "4A" : String(r.pos + 10); });
    let c = compare_chains(a, b);
    assert.equal(c.diffs[0].text, "G12 is a different nucleotide.");
    assert.ok(!c.diffs[0].detail.includes("numbers"));
    assert.equal(c.diffs[1].text, "A4 is a different nucleotide.", "the ruler's place when they differ");
    assert.match(c.diffs[1].detail, /A1 numbers 14, B1 4A$/);
});

test("chains of different lengths are refused", () => {
    let b = chain("B1");
    b.residues.pop();
    assert.throws(() => compare_chains(chain("A1"), b));
});

test("no text a reader sees has an em dash", () => {
    let a = chain("A1", { pairs: [...STEM, [4, 6, "tWH"]], steps: [[1, "AA00", "AAA", 80]], codes: { 5: "8AN" } });
    let b = chain("B1", { pairs: [STEM[0], [4, 6, "cSS"]], steps: [[1, "BB00", "BBB", 80]], missing: [9] });
    let c = compare_chains(a, b);
    for (const s of [c.summary.headline, ...c.summary.facts, ...c.diffs.flatMap((d) => [d.text, d.detail])]) {
        assert.ok(!DASHES.test(s), s);
    }
});

test("only plain sequences take part", () => {
    assert.equal(sequence_key("polyribonucleotide", "gg aC u"), "polyribonucleotide\nGGACU");
    assert.equal(sequence_key("polyribonucleotide", "GGNAC"), null);
    assert.equal(sequence_key("polyribonucleotide", "GGXAC"), null);
    assert.equal(sequence_key("polyribonucleotide", ""), null);
    assert.notEqual(sequence_key("polyribonucleotide", "ACGU"), sequence_key("polydeoxyribonucleotide", "ACGU"));
});

test("the best model is the best resolved, then the most confident", () => {
    let list = [{ id: "nmr", resolution: null, confal: 90 }, { id: "low", resolution: 3.1, confal: 80 },
                { id: "x", resolution: 2.4, confal: 60 }, { id: "y", resolution: 2.4, confal: 70 }];
    assert.deepEqual(list.sort(best_rank).map((c) => c.id), ["y", "x", "low", "nmr"]);
});
