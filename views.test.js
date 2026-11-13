// views.test.js - the 1D view's plain layered dot-bracket lines.
import test from "node:test";
import assert from "node:assert";
import { lbn_lines, view_url, next_tile, column_words } from "./public/views.js";

const MAP = { names: ["A", "B′"], seq: "GCGCA&UGCGC",
              rows: [{ name: "WC", text: "((((.&.))))" }, { name: "tWH", text: "....(&)...." }] };

test("1D is a strand line, the sequence and one line per bracket row, labels padded", () => {
    assert.deepEqual(lbn_lines(MAP), [
        "       A     B′",
        "seq    GCGCA&UGCGC",
        "WC     ((((.&.))))",
        "tWH    ....(&)...."
    ]);
});

test("a strand name longer than its strand is cut to fit; no pairs is just the sequence", () => {
    assert.deepEqual(lbn_lines({ names: ["AAA", "B"], seq: "G&C", rows: [] }),
                     ["       A B", "seq    G&C"]);
});

test("the open view is kept in ?view=, the first view leaves none; other parameters and the #section stay", () => {
    let at = "https://na3db.org/structure/1P8K?x=1#overview";
    assert.equal(view_url(at, "2d", "1d"), "/structure/1P8K?x=1&view=2d#overview");
    assert.equal(view_url("https://na3db.org/structure/1P8K?view=2d#links", "3d", "1d"), "/structure/1P8K?view=3d#links");
    assert.equal(view_url("https://na3db.org/structure/1P8K?view=3d", "1d", "1d"), "/structure/1P8K");
});

test("arrow keys move between the tiles and wrap; Home and End go to the ends; other keys do nothing", () => {
    assert.deepEqual([0, 1, 2].map((at) => next_tile("ArrowRight", at, 3)), [1, 2, 0]);
    assert.deepEqual([0, 1, 2].map((at) => next_tile("ArrowLeft", at, 3)), [2, 0, 1]);
    assert.deepEqual([next_tile("Home", 2, 3), next_tile("End", 0, 3)], [0, 2]);
    assert.equal(next_tile("Enter", 1, 3), null);
    assert.equal(next_tile("ArrowDown", 1, 3), null, "down scrolls the page as usual");
});

test("pointing at a nucleotide says what it pairs with, read from that base, or that it is not paired", () => {
    // A: GCGCA, B′: UGCGC. WC pairs A1-B′5 ... ; tWH pairs A5 with B′1.
    let map = { ...MAP, cols: [["G", "1", 1, "G"], ["C", "2", 1, "C"], ["G", "3", 1, "G"], ["C", "4", 1, "C"], ["a", "5", 1, "PSU"],
                               null, ["U", "1", 0, "U"], ["G", "2", 1, "G"], ["C", "3", 1, "C"], ["G", "4", 1, "G"], ["C", "5", 1, "C"]],
                rows: [{ name: "WC", text: "((((.&.))))", pairs: [[0, 10], [1, 9], [2, 8], [3, 7]] },
                       { name: "tWH", text: "....(&)....", pairs: [[4, 6]] }] };

    assert.deepEqual(column_words(map, 0), { partners: [10], text: "A:G1 · pairs with B′:C5 (WC)" });
    assert.deepEqual(column_words(map, 7), { partners: [3], text: "B′:G2 · pairs with A:C4 (WC)" }, "from either end");
    assert.equal(column_words(map, 4).text, "A:PSU5 · pairs with B′:U1 (tWH)", "modified: its own code");
    assert.equal(column_words(map, 6).text, "B′:U1, not in the model · pairs with A:PSU5 (tHW)", "the family from this base");
    assert.equal(column_words(map, 5), null, "the strand separator says nothing");

    let one = { names: ["A"], seq: "GAC", cols: [["G", "1", 1, "G"], ["A", "2", 1, "A"], ["C", "3", 1, "C"]],
                rows: [{ name: "WC", text: "(.)", pairs: [[0, 2]] }, { name: "tHS", text: "(.)", pairs: [[0, 2]] }] };
    assert.equal(column_words(one, 1).text, "A2 · not paired", "one strand: no strand name");
    assert.deepEqual(column_words(one, 2), { partners: [0, 0], text: "C3 · pairs with G1 (WC), G1 (tSH)" }, "every row it is in");
});
