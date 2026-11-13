// seqmap.test.js - checks sequence_map, which lays an entry's sequence, NtC
// steps and base pairs on one ruler in layered dot-bracket notation. No
// database: the fixture is 9CFN chain A as NA3DB returns it, whose rows the
// hackathon notation's README prints.

import test from "node:test";
import assert from "node:assert";
import { sequence_map, sequence_map_text, MAP_STRANDS } from "./detail.js";

const rna = (labels) => [{ id: "1", kind: "RNA", chains: labels.map((label) => ({ label, auth: label })) },
                         { id: "2", kind: "Protein", chains: [{ label: "P", auth: "P" }] }];

// 9CFN chain A: 59 nt, 56-59 not in the model.
const SEQ = "AAGUACCCUCCAAGCCCUACAGGUUGGAAGAGGGGGCUAUCAGUCCUGUAGGCAGACUC";
const residues = (label, seq, missing = []) => [...seq].map((code, i) =>
    ({ label, pos: i + 1, code, num: String(i + 1), seen: !missing.includes(i + 1), parent: code, modified: false }));
const PAIRS = [[2, 38, "cWW", "wc"], [3, 37, "cWW", "wc"], [4, 36, "cWW", "gu"], [5, 26, "tWS", "nc"],
    [6, 27, "cWW", "wc"], [7, 35, "cWW", "wc"], [8, 34, "cWW", "wc"], [9, 33, "cWW", "gu"],
    [10, 32, "cWW", "wc"], [11, 30, "cWW", "wc"], [14, 53, "cWW", "wc"], [16, 52, "cWW", "wc"],
    [17, 51, "cWW", "wc"], [18, 50, "cWW", "wc"], [19, 49, "cWW", "wc"], [21, 47, "cWW", "wc"],
    [22, 46, "cWW", "wc"], [23, 45, "cWW", "wc"], [24, 31, "tWW", "nc"], [25, 29, "tWH", "nc"],
    [29, 43, "tWS", "nc"], [42, 5, "tWH", "nc"]]
    .map(([pos_1, pos_2, family, kind]) => ({ label_1: "A", pos_1, label_2: "A", pos_2, family, kind, copy_1: "1", copy_2: "1" }));
const step = (label, pos, ntc, cana, confal) =>
    ({ label_1: label, pos_1: pos, label_2: label, pos_2: pos + 1, ntc, cana, confal, closest: "OP29" });
const STEPS = [step("A", 4, "NANT", "NAN", 0), step("A", 5, "IC06", "ICL", 72), step("A", 6, "OP12", "OPN", 74)];
const TRACKS = { residues: residues("A", SEQ, [56, 57, 58, 59]), steps: STEPS };

test("9CFN chain A gives the rows the notation's README prints", () => {
    let map = sequence_map(rna(["A"]), TRACKS, PAIRS);

    assert.equal(map.seq, SEQ);
    assert.deepEqual(map.rows.map((r) => [r.name, r.text]), [
        ["WC",  ".((..([[.[[..{.{{{{.{{{...)..].].]].))......}}}.}}}}}......"],
        ["cWW", "...(....(.......................)..)......................."],
        ["tWW", ".......................(......)............................"],
        ["tWH", "........................(...).............................."],
        ["tWS", "....(....................)..(.............)................"],
        ["tHW", "....(....................................)................."]
    ]);
    assert.deepEqual(map.rows.find((r) => r.name === "tHW").pairs, [[4, 41]],
                     "42-5 tWH is read from the lower base: A5 tHW A42");
    assert.deepEqual(map.cols[55], ["A", "56", 0, "A"], "56 is in the sequence, not the model");
    assert.deepEqual(map.shown, ["A"]);
});

test("each NtC step sits after its first nucleotide; NANT has no class", () => {
    let map = sequence_map(rna(["A"]), TRACKS, PAIRS);

    assert.deepEqual(map.steps.map((s) => [s.i, s.ntc, s.cana, s.confal]),
                     [[3, null, "NAN", 0], [4, "IC06", "ICL", 72], [5, "OP12", "OPN", 74]]);
    assert.equal(map.steps[0].closest, "OP29", "the closest class is kept for the reader");
});

test("a base that pairs twice in one family spills to a second row of it; crossing pairs take [ ]", () => {
    let pairs = [{ label_1: "A", pos_1: 1, label_2: "A", pos_2: 10, family: "tHS", kind: "nc", copy_1: "1", copy_2: "1" },
                 { label_1: "A", pos_1: 1, label_2: "A", pos_2: 6, family: "tHS", kind: "nc", copy_1: "1", copy_2: "1" },
                 { label_1: "A", pos_1: 3, label_2: "A", pos_2: 8, family: "tHS", kind: "nc", copy_1: "1", copy_2: "1" }];
    let map = sequence_map(rna(["A"]), { residues: residues("A", "GGGGGCCCCC"), steps: [] }, pairs);

    assert.deepEqual(map.rows.map((r) => [r.name, r.text, r.overflow]),
                     [["tHS", "(.[..).]..", false], ["tHS", "(........)", true]]);
});

test("a duplex: the partner strand comes along, after a separator", () => {
    let tracks = { residues: [...residues("C", "GCGC"), ...residues("D", "GCGC")],
                   steps: [step("C", 1, "BB00", "BBB", 90), step("D", 3, "AB01", "A-B", 40)] };
    let pairs = [[1, 4], [2, 3], [3, 2], [4, 1]].map(([a, b]) =>
        ({ label_1: "C", pos_1: a, label_2: "D", pos_2: b, family: "cWW", kind: "wc", copy_1: "1", copy_2: "1" }));
    let map = sequence_map(rna(["C", "D"]), tracks, pairs);

    assert.deepEqual(map.shown, ["C", "D"]);
    assert.equal(map.seq, "GCGC&GCGC");
    assert.deepEqual(map.rows.map((r) => r.text), ["((((&))))"]);
    assert.deepEqual(map.steps.map((s) => [s.i, s.cana]), [[0, "BBB"], [7, "A-B"]]);
    assert.deepEqual(map.strands.map((s) => [s.key, s.partners]), [["C", ["D"]], ["D", ["C"]]]);

    let one = sequence_map(rna(["C", "D"]), tracks, pairs, ["D"]);
    assert.deepEqual([one.shown, one.rows], [["D"], []], "one strand asked for: its pairs to C are off the ruler");
    assert.deepEqual(sequence_map(rna(["C", "D"]), tracks, pairs, ["nope"]).shown, ["C", "D"],
                     "unknown strands fall back to the default");
});

// Pairs between strands as cWW Watson–Crick, one per [strand, pos, strand, pos].
const between = (list) => list.map(([label_1, pos_1, label_2, pos_2]) =>
    ({ label_1, pos_1, label_2, pos_2, family: "cWW", kind: "wc", copy_1: "1", copy_2: "1" }));

test("by default every strand linked through pairs is shown, in file order (1P8K)", () => {
    // 1P8K: A pairs with D and C, B only with C, so B is reached through C.
    let tracks = { residues: ["A", "B", "C", "D"].flatMap((l) => residues(l, "GCGC")), steps: [] };
    let pairs = between([["A", 1, "D", 4], ["A", 4, "C", 1], ["B", 1, "C", 4]]);
    let map = sequence_map(rna(["A", "B", "C", "D"]), tracks, pairs);

    assert.deepEqual(map.shown, ["A", "B", "C", "D"]);
    assert.equal(map.seq, "GCGC&GCGC&GCGC&GCGC");
});

test("a strand with no link to the first is left for the picker", () => {
    let tracks = { residues: ["A", "B", "C", "D"].flatMap((l) => residues(l, "GCGC")), steps: [] };
    let map = sequence_map(rna(["A", "B", "C", "D"]), tracks, between([["A", 1, "B", 4], ["C", 1, "D", 4]]));

    assert.deepEqual(map.shown, ["A", "B"]);
});

test("a long chain of linked strands stops at the cap, nearest strands first", () => {
    let labels = Array.from({ length: MAP_STRANDS + 4 }, (_, n) => `S${n}`);
    let tracks = { residues: labels.flatMap((l) => residues(l, "GC")), steps: [] };
    // S0-S1, S1-S2, ...: each strand reached through the one before.
    let pairs = between(labels.slice(1).map((l, n) => [labels[n], 1, l, 2]));
    let map = sequence_map(rna(labels), tracks, pairs);

    assert.equal(MAP_STRANDS, 8);
    assert.deepEqual(map.shown, labels.slice(0, MAP_STRANDS));

    // One strand pairing with all the others reaches them at once: still capped.
    let star = sequence_map(rna(labels), tracks, between(labels.slice(1).map((l) => ["S0", 1, l, 2])));
    assert.deepEqual(star.shown, labels.slice(0, MAP_STRANDS));
});

test("a symmetry copy is its own strand, named with a prime", () => {
    let pairs = [[1, 4], [2, 3], [3, 2], [4, 1]].map(([a, b]) =>
        ({ label_1: "A", pos_1: a, label_2: "A", pos_2: b, family: "cWW", kind: "wc", copy_1: "1", copy_2: "2_755" }));
    let map = sequence_map(rna(["A"]), { residues: residues("A", "GCGC"), steps: [step("A", 2, "BB00", "BBB", 80)] }, pairs);

    assert.deepEqual(map.shown, ["A", "A:2_755"]);
    assert.deepEqual(map.names, ["A", "A′"]);
    assert.equal(map.rows[0].text, "((((&))))");
    assert.deepEqual(map.steps.map((s) => s.i), [1, 6], "the copy shares its chain's steps");
});

test("modified nucleotides are their parent in lower case", () => {
    let res = [{ label: "A", pos: 1, code: "G", num: "1", seen: true, parent: "G", modified: false },
               { label: "A", pos: 2, code: "PSU", num: "2", seen: true, parent: "U", modified: true },
               { label: "A", pos: 3, code: "DT", num: "3", seen: true, parent: "DT", modified: false },
               { label: "A", pos: 4, code: "XYZ", num: "4", seen: true, parent: null, modified: true }];
    assert.equal(sequence_map(rna(["A"]), { residues: res, steps: [] }, []).seq, "GuTn");
});

test("no nucleic-acid chain, no map", () => {
    assert.equal(sequence_map(rna([]), { residues: [], steps: [] }, []), null);
});

test("the text file is the notation, NtC steps in comment lines", () => {
    let text = sequence_map_text("9CFN", sequence_map(rna(["A"]), TRACKS, PAIRS));
    let lines = text.split("\n");

    assert.equal(lines[0], ">9CFN|A");
    assert.ok(lines.filter((l) => l.startsWith("#")).some((l) => l.includes("5:IC06")), "steps numbered by column");
    assert.ok(lines.includes(`${"seq".padEnd(12)}: ${SEQ}`));
    assert.ok(lines.includes(`${"WC".padEnd(12)}: .((..([[.[[..{.{{{{.{{{...)..].].]].))......}}}.}}}}}......`));
    assert.ok(lines.every((l) => !l || l.startsWith(">") || l.startsWith("#") || /^\S+\s*: /.test(l)),
              "every other line is a row a reader of the notation parses");
});
