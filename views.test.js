// views.test.js - the 1D view's plain layered dot-bracket lines.
import test from "node:test";
import assert from "node:assert";
import { lbn_lines, view_url, next_tile, column_words, column_key, pair_key, mount_3d, view_for_section } from "./public/views.js";

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

    assert.deepEqual(column_words(map, 0), { partners: [10], head: "A:G1", items: [{ col: 10, text: "B′:C5 (WC)" }],
                                             text: "A:G1 · pairs with B′:C5 (WC)" });
    assert.deepEqual(column_words(map, 7).text, "B′:G2 · pairs with A:C4 (WC)", "from either end");
    assert.deepEqual(column_words(map, 7).partners, [3]);
    assert.equal(column_words(map, 4).text, "A:PSU5 · pairs with B′:U1 (tWH)", "modified: its own code");
    assert.equal(column_words(map, 6).text, "B′:U1, not in the model · pairs with A:PSU5 (tHW)", "the family from this base");
    assert.equal(column_words(map, 5), null, "the strand separator says nothing");

    let one = { names: ["A"], seq: "GAC", cols: [["G", "1", 1, "G"], ["A", "2", 1, "A"], ["C", "3", 1, "C"]],
                rows: [{ name: "WC", text: "(.)", pairs: [[0, 2]] }, { name: "tHS", text: "(.)", pairs: [[0, 2]] }] };
    assert.equal(column_words(one, 1).text, "A2 · not paired", "one strand: no strand name");
    assert.equal(column_words(one, 2).text, "C3 · pairs with G1 (WC), G1 (tSH)", "every row it is in");
    assert.deepEqual(column_words(one, 2).partners, [0, 0]);
});

// The Base pairs table keys each end as the server does ("A 12", a symmetry
// copy "A:2_755 12"): strand token, a space, the position in the chain, not
// the author's number, which can repeat with an insertion code.
test("a column's key is its strand's token and its position; a pair is the same either way round", () => {
    let map = { shown: ["A", "B:2_755"], seq: "GC&AU",
                cols: [["G", "10", 1, "G", 1], ["C", "10A", 1, "C", 2], null, ["A", "5", 1, "A", 1], ["U", "6", 1, "U", 2]] };
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => column_key(map, i)), ["A 1", "A 2", null, "B:2_755 1", "B:2_755 2"]);
    assert.equal(pair_key("B:2_755 1", "A 2"), pair_key("A 2", "B:2_755 1"));
    assert.notEqual(pair_key("A 1", "A 12"), pair_key("A 11", "A 2"), "the ends stay apart");
});

// The 3D view's frame. Made here rather than in the HTML because behind it
// are the coordinates, coot and the annotation of every base pair.
test("the 3D frame is made once, from the address the page put on the box", () => {
    let made = [];
    // Enough of a document for mount_3d: it asks for one element and appends.
    globalThis.document = { createElement: (tag) => { let el = { tag, dataset: {},
        classList: { add() {} }, addEventListener() {} }; made.push(el); return el; } };
    let box = { dataset: { src: "/viewer/?embed=1&id=4TNA", entry: "4TNA" }, children: [],
                classList: { add() {} }, append(el) { this.children.push(el); } };

    let frame = mount_3d(box);
    assert.equal(frame.tag, "iframe");
    assert.equal(frame.src, "/viewer/?embed=1&id=4TNA");
    assert.equal(frame.title, "3D viewer of 4TNA");
    assert.equal(box.children.length, 1);

    // A second click must not restart a run that may be a minute old.
    assert.equal(mount_3d(box), null);
    assert.equal(box.children.length, 1);
    assert.equal(made.length, 1);
    assert.equal(mount_3d(null), null, "no box, nothing to make");
    delete globalThis.document;
});

// The open view follows the section being read (structure.ejs announces it).
test("a section about the pairs opens 1D, conformation opens 3D, the rest leave the view alone", () => {
    assert.equal(view_for_section("base-pairs"), "1d");
    assert.equal(view_for_section("sequence-map"), "1d");
    assert.equal(view_for_section("conformation"), "3d");
    // Nothing maps to 2D while it is a place kept rather than a view.
    for (const id of ["views", "overview", "molecules", "sources", "modified-nucleotides",
                      "ligands", "same-sequence", "citations", "links", "nonsense"]) {
        assert.equal(view_for_section(id), null, `${id} changes nothing`);
    }
});
