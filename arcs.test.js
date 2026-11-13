// arcs.test.js - checks pair_arcs, which draws an entry's base pairs as an
// arc diagram. No database: the fixtures are real NA3DB rows for 1B23 (a
// tRNA), 119D (a DNA duplex) and 7KLP (a G-quadruplex), as entry_base_pairs
// and entry_residues return them.

import test from "node:test";
import assert from "node:assert";
import { pair_arcs, nested_set, ARC_WIDTH, ARC_HEIGHT } from "./detail.js";

// One polymer, as entry_contents gives it.
const polymer = (id, kind, labels, length) =>
    ({ id, kind, chains: labels.map((label) => ({ label, auth: label })), length });

// Its residues, as entry_residues gives them: one per position.
const residues_for = (length, modified = []) =>
    Array.from({ length }, (_, i) => ({ pos: i + 1, modified: modified.includes(i + 1) }));

const pair = (label_1, pos_1, label_2, pos_2, family = "cWW", kind = "wc", copy_1 = "1", copy_2 = "1") =>
    ({ label_1, pos_1, label_2, pos_2, family, kind, copy_1, copy_2 });

// Every arc as [x start, x end, y of the control points]. A tall arc's control
// points sit above the picture; the curve itself peaks at 3/4 of that height.
const arcs = (path) => [...path.matchAll(/M(-?[\d.]+) -?[\d.]+C-?[\d.]+ (-?[\d.]+) -?[\d.]+ -?[\d.]+ (-?[\d.]+) -?[\d.]+/g)]
    .map((m) => [Number(m[1]), Number(m[3]), Number(m[2])]);
const numbers = (path) => [...path.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));

// 1B23: chain R, 74 nt, and a protein that must not be drawn.
const T_RNA = [polymer("1", "RNA", ["R"], 74), polymer("2", "Protein", ["P"], 405)];
const T_RES = new Map([["1", residues_for(74, [8, 19, 20, 31, 36, 38, 52, 53])],
                       ["2", residues_for(405)]]);
const T_PAIRS = [
    [1, 70, "cWW", "wc"], [2, 69, "cWW", "wc"], [3, 68, "cWW", "wc"], [4, 67, "cWW", "wc"],
    [5, 66, "cWW", "wc"], [6, 65, "cWW", "wc"], [7, 64, "cWW", "wc"], [8, 45, "cSS", "nc"],
    [8, 14, "tWH", "nc"], [10, 24, "cWW", "wc"], [11, 23, "cWW", "wc"], [12, 22, "cWW", "wc"],
    [13, 9, "tWH", "nc"], [16, 57, "tWW", "nc"], [18, 54, "cWW", "wc"], [26, 42, "cWW", "gu"],
    [27, 41, "cWW", "wc"], [28, 40, "cWW", "wc"], [29, 39, "cWW", "wc"], [47, 63, "cWW", "wc"],
    [48, 62, "cWW", "wc"], [49, 61, "cWW", "wc"], [50, 60, "cWW", "wc"], [51, 59, "cWW", "wc"],
    [52, 56, "tWH", "nc"]].map(([a, b, f, k]) => pair("R", a, "R", b, f, k));

test("a tRNA: every pair drawn, one path per kind as the Base pairs section counts them", () => {
    let d = pair_arcs(T_RNA, T_RES, T_PAIRS);

    assert.deepEqual(d.counts, { drawn: 25, copies: 0, unplaced: 0, nucleotides: 74, modified: 8 });
    assert.equal(arcs(d.paths.wc).length, 19);
    assert.equal(arcs(d.paths.gu).length, 1, "G26-U42");
    assert.equal(arcs(d.paths.nc).length, 5);
    assert.deepEqual(d.chains.map((c) => c.label), ["R"], "the protein is not on the line");
    assert.equal(d.width, ARC_WIDTH);
    // 8-14, 9-13, 16-57 and 18-54 cross the D stem (10-24): under the line, and the
    // picture grows to hold them, the names under them.
    let under = d.layout.pairs.filter((p) => p[7] === 1).map((p) => `${p[0]}-${p[1]}`);
    assert.deepEqual(under, ["8-14", "9-13", "16-57", "18-54"]);
    assert.equal(d.below, 4);
    assert.ok(d.bottom > d.base && d.height === ARC_HEIGHT + d.bottom - d.base);
});

test("a stem draws as nested arcs: the outer pair is wider and taller", () => {
    let [outer, inner] = arcs(pair_arcs(T_RNA, T_RES, T_PAIRS).paths.wc);  // 1-70, 2-69

    assert.ok(outer[0] < inner[0] && inner[1] < outer[1], "2-69 sits inside 1-70");
    assert.ok(outer[2] < inner[2], "1-70 rises higher (smaller y)");
});

test("a duplex: both strands on the line, A1-B12 the outermost arc", () => {
    let entities = [polymer("1", "DNA", ["A", "B"], 12)];
    let pairs = Array.from({ length: 12 }, (_, k) => pair("A", k + 1, "B", 12 - k));
    let d = pair_arcs(entities, new Map([["1", residues_for(12)]]), pairs);

    assert.deepEqual(d.chains.map((c) => c.label), ["A", "B"]);
    assert.ok(d.chains[0].x2 < d.chains[1].x1, "a gap between the strands");
    let all = arcs(d.paths.wc);
    let widths = all.map(([a, b]) => b - a);
    assert.equal(all.length, 12);
    assert.deepEqual(widths, [...widths].sort((x, y) => y - x), "A1-B12 widest, A12-B1 narrowest");
    assert.equal(d.paths.nc, "");
    assert.equal(d.paths.gu, "");
});

test("a pair listed twice (alternate locations) is drawn once", () => {
    let entities = [polymer("1", "DNA", ["A"], 22)];
    let rows = [[20, 2], [2, 8], [21, 3], [3, 9], [22, 4], [4, 10], [8, 14], [9, 15], [10, 16],
                [14, 20], [15, 21], [16, 22]];
    let once = rows.map(([a, b]) => pair("A", a, "A", b, "cWH", "nc"));
    let twice = [...once, ...once.slice(0, 6), pair("A", 2, "A", 20, "cWH", "nc")];  // as in 7KLP
    let d = pair_arcs(entities, new Map([["1", residues_for(22)]]), twice);

    assert.equal(d.counts.drawn, 12);
    assert.equal(arcs(d.paths.nc).length, 12);
});

test("a duplex made by crystal symmetry draws the copy as a second strand, A′", () => {
    // 1D26: one 8-nt strand in the file; A1 pairs with A8 of copy 2, and so on.
    let entities = [polymer("1", "DNA", ["A"], 8)];
    let res = new Map([["1", residues_for(8)]]);
    let mate = Array.from({ length: 8 }, (_, k) => pair("A", k + 1, "A", 8 - k, "cWW", "wc", "1", "2"));
    let d = pair_arcs(entities, res, mate);

    assert.deepEqual(d.chains.map((c) => [c.name, c.copy, c.symmetry]), [["A", "1", false], ["A′", "2", true]]);
    assert.ok(d.chains[0].x2 < d.chains[1].x1, "two strands, not one");
    assert.equal(d.counts.copies, 1);
    assert.equal(d.counts.nucleotides, 16);
    let widths = arcs(d.paths.wc).map(([a, b]) => b - a);
    assert.equal(widths.length, 8);
    assert.ok(arcs(d.paths.wc).every(([a, b]) => a < d.chains[0].x2 && b > d.chains[1].x1),
              "every arc crosses from A to A′, none stays inside A");
});

test("a pair inside the file's copy and one with a symmetry copy sit side by side", () => {
    let entities = [polymer("1", "RNA", ["A", "B"], 10)];
    let res = new Map([["1", residues_for(10, [3])]]);
    let d = pair_arcs(entities, res, [pair("A", 1, "A", 10),                         // hairpin in A
                                      pair("B", 2, "A", 5, "tWH", "nc", "3", "1"),   // B of copy 3 with A
                                      pair("A", 4, "A", 6, "cWW", "wc", "2", "1"),   // A of copy 2 with A
                                      pair("B", 1, "B", 9, "cWW", "wc", "2", "2")]); // both ends in copy 2

    assert.deepEqual(d.chains.map((c) => c.name), ["A", "A′", "B′", "B″"],
                     "page order, the file's copy first, then copies in operator order");
    assert.equal(d.counts.copies, 3);
    assert.equal(d.counts.modified, 4, "each strand shows its own modified 3");
    assert.deepEqual(d.chains.map((c) => c.copy), ["1", "2", "2", "3"]);
});

test("no pairs, or none that land on a nucleic-acid chain, give no picture", () => {
    let res = new Map([["1", residues_for(12)], ["2", residues_for(50)]]);
    let entities = [polymer("1", "RNA", ["A"], 12), polymer("2", "Protein", ["P"], 50)];

    assert.equal(pair_arcs(entities, res, []), null);
    assert.equal(pair_arcs(entities, res, [pair("A", 1, "P", 3)]), null, "protein end");
    assert.equal(pair_arcs(entities, res, [pair("A", 1, "A", 13)]), null, "past the chain's end");

    let d = pair_arcs(entities, res, [pair("A", 1, "A", 12), pair("A", 0, "A", 5)]);
    assert.equal(d.counts.unplaced, 1);
    assert.equal(d.counts.drawn, 1);
});

test("only chains with a pair are drawn, in the page's order", () => {
    let entities = [polymer("1", "RNA", ["C", "D"], 10), polymer("2", "RNA", ["E"], 8),
                    polymer("3", "DNA", ["F"], 6)];
    let res = new Map([["1", residues_for(10, [4])], ["2", residues_for(8)], ["3", residues_for(6)]]);
    let d = pair_arcs(entities, res, [pair("D", 1, "D", 10), pair("F", 1, "D", 2)]);

    assert.deepEqual(d.chains.map((c) => c.label), ["D", "F"]);
    assert.equal(d.counts.nucleotides, 16);
    assert.equal(d.counts.modified, 1, "D's modified 4 is drawn; C is not on the line");
});

test("sixty chains still fit inside the picture", () => {
    let labels = Array.from({ length: 60 }, (_, i) => `C${i}`);
    let entities = [polymer("1", "RNA", labels, 1500)];
    let res = new Map([["1", residues_for(1500, [1, 750, 1500])]]);
    let pairs = labels.flatMap((l) => [pair(l, 1, l, 1500), pair(l, 2, l, 3, "tWH", "nc")]);
    let d = pair_arcs(entities, res, pairs);

    assert.equal(d.chains.length, 60);
    for (const c of d.chains) assert.ok(c.x1 < c.x2, `${c.label} has a length on screen`);
    let xs = [d.paths.wc, d.paths.nc, d.dot_path].flatMap(numbers);
    assert.ok(xs.every((v) => v >= -ARC_WIDTH && v <= ARC_WIDTH));
    for (const [a, b, y] of [...arcs(d.paths.wc), ...arcs(d.paths.nc)]) {
        assert.ok(a >= 0 && b <= ARC_WIDTH, "inside left and right");
        assert.ok(y > -ARC_HEIGHT && y < d.base, "control point above the line");
    }
});

test("the widest arc peaks inside the top of the picture", () => {
    let entities = [polymer("1", "RNA", ["A"], 100)];
    let d = pair_arcs(entities, new Map([["1", residues_for(100)]]), [pair("A", 1, "A", 100)]);
    let [[, , y]] = arcs(d.paths.wc);
    let peak = d.base - 0.75 * (d.base - y);   // where a cubic curve with this control height tops out

    assert.ok(peak >= 0 && peak < 12, `peak at y=${peak}`);
});

test("each pair has its own arc, named as the Base pairs table names it, a copy with its prime", () => {
    let entities = [polymer("1", "DNA", ["A"], 8)];
    let mate = [{ ...pair("A", 1, "A", 8, "cWW", "wc", "1", "2"), res_1: "DC1", res_2: "DG8" }];
    let d = pair_arcs(entities, new Map([["1", residues_for(8)]]), mate);

    assert.deepEqual(d.each.map((a) => [a.kind, a.label]), [["wc", "A:DC1 – A′:DG8 · cWW"]]);
    assert.equal(d.each[0].d, d.paths.wc, "the same arc as the kind's path");
});

test("a big entry keeps one path per kind, and thinner lines", () => {
    let labels = Array.from({ length: 60 }, (_, i) => `C${i}`);
    let entities = [polymer("1", "RNA", labels, 30)];
    let pairs = labels.flatMap((l) => Array.from({ length: 10 }, (_, k) => pair(l, k + 1, l, 30 - k)));
    let big = pair_arcs(entities, new Map([["1", residues_for(30)]]), pairs);
    let small = pair_arcs(entities, new Map([["1", residues_for(30)]]), pairs.slice(0, 10));

    assert.equal(big.counts.drawn, 600);
    assert.equal(big.each, null, "600 hover arcs would weigh down the page");
    assert.equal(small.each.length, 10);
    assert.ok(big.stroke < small.stroke && big.stroke >= 0.4);
});

test("the layout gives the viewer the same picture as numbers", () => {
    let entities = [{ ...polymer("1", "DNA", ["A"], 8), sequence: "CGCG\nAATT" }];
    let mate = [pair("A", 1, "A", 8, "cWW", "wc", "1", "2"), pair("A", 3, "A", 3, "cWW", "wc", "1", "2"),
                pair("A", 6, "A", 2, "tWH", "nc")];
    let { layout } = pair_arcs(entities, new Map([["1", residues_for(8, [5])]]), mate);

    assert.deepEqual(layout.strands, [
        { name: "A", symmetry: false, start: 0, length: 8, modified: [5], sequence: "CGCGAATT" },
        { name: "A′", symmetry: true, start: 8, length: 8, modified: [5], sequence: "CGCGAATT" }],
        "each strand carries its letters, the line breaks gone");
    assert.deepEqual(layout.pairs, [[1, 16, "wc", "A:1 – A′:8 · cWW", "cWW", "A:1", "A′:8"],
                                    [3, 11, "wc", "A:3 – A′:3 · cWW", "cWW", "A:3", "A′:3"],
                                    [2, 6, "nc", "A:6 – A:2 · tWH", "tWH", "A:2", "A:6", 1]],
                     "A1 to the copy's 8th, at 8 + 8; the ends named in position order; 2-6 crosses 3-11, so under the line");
});

test("the small picture is a standalone image: own colours, no labels, escaped id", async () => {
    const { arc_thumbnail } = await import("./detail.js");
    let entities = [polymer("1", "DNA", ["A"], 8)];
    let d = pair_arcs(entities, new Map([["1", residues_for(8, [3])]]),
                      [pair("A", 1, "A", 8, "cWW", "wc", "1", "2"), pair("A", 2, "A", 7, "tWH", "nc", "1", "2")]);
    let svg = arc_thumbnail(d, "1D26");

    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(svg, /<path stroke="#139068" class="wc" d="M/);
    assert.match(svg, /<path stroke="#7f77dd" class="nc" d="M/);
    assert.ok(!svg.includes("#e0a030"), "no G·U, no G·U path");
    assert.match(svg, /stroke-dasharray/, "the copy is dashed");
    assert.match(svg, /<path fill="#26215c" class="m"/, "modified dots");
    // Dark colours ride along for a page in the dark theme.
    assert.match(svg, /@media \(prefers-color-scheme: dark\)/);
    assert.ok(!svg.includes("<text"), "no labels at this size");
    assert.match(arc_thumbnail(null, `<x>"`), /&lt;x>&quot;: no base pairs annotated/);
});

test("a card's numbers come from the same picture: strands, nucleotides, pairs, Watson–Crick, modified", async () => {
    const { arc_summary } = await import("./detail.js");
    let entities = [polymer("1", "DNA", ["A"], 8)];
    let d = pair_arcs(entities, new Map([["1", residues_for(8, [3])]]),
                      [pair("A", 1, "A", 8, "cWW", "wc", "1", "2"), pair("A", 2, "A", 7, "tWH", "nc", "1", "2")]);

    assert.deepEqual(arc_summary(d), { strands: 2, nucleotides: 16, pairs: 2, modified: 2, wc: 1 },
                     "the symmetry copy counts as a strand drawn, with its own modified residue");
    assert.equal(arc_summary(null), null);
});

// --- which arcs go above the line ----------------------------------------
const cross = ([i, j], [k, l]) => (i < k && k < j && j < l) || (k < i && i < l && l < j);
const kept = (arcs, w = () => 1) => [...nested_set(arcs, w)].sort((a, b) => a - b);

test("nested_set: a stem stays above, the pair that crosses it goes below", () => {
    let arcs = [[1, 10], [2, 9], [3, 8], [5, 15]];
    assert.deepEqual(kept(arcs), [0, 1, 2]);
});

test("nested_set: arcs side by side, sharing an end, or equal, all stay above", () => {
    assert.deepEqual(kept([[1, 4], [5, 9], [1, 9]]), [0, 1, 2]);
    assert.deepEqual(kept([[1, 10], [1, 5], [5, 10]]), [0, 1, 2], "a base in two pairs");
    assert.deepEqual(kept([[2, 7], [2, 7]]), [0, 1], "one pair in two families");
});

test("nested_set: weight decides, not order: Watson–Crick counts twice", () => {
    let arcs = [[1, 10], [5, 15]];
    assert.deepEqual(kept(arcs, (k) => [1, 2][k]), [1]);
    assert.deepEqual(kept(arcs, (k) => [2, 1][k]), [0]);
    // Three Others nested in each other outweigh one Watson–Crick pair.
    let three = [[1, 10], [5, 15], [6, 14], [7, 13]];
    assert.deepEqual(kept(three, (k) => (k === 0 ? 2 : 1)), [1, 2, 3]);
});

test("nested_set: the most weight that does not cross, as trying every subset finds", () => {
    let seed = 7;
    let rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let round = 0; round < 300; round++) {
        let n = 1 + rand(11);
        let arcs = Array.from({ length: n }, () => { let a = 1 + rand(14), b = 1 + rand(14); return a < b ? [a, b] : [b, a + 1]; });
        let w = arcs.map(() => 1 + rand(2));
        let best = 0;
        for (let m = 0; m < 1 << n; m++) {
            let set = arcs.filter((_, k) => m >> k & 1);
            if (set.some((x, i) => set.some((y, j) => j > i && cross(x, y)))) continue;
            best = Math.max(best, arcs.reduce((s, _, k) => s + (m >> k & 1 ? w[k] : 0), 0));
        }
        let got = kept(arcs, (k) => w[k]);
        let set = got.map((k) => arcs[k]);
        assert.ok(!set.some((x, i) => set.some((y, j) => j > i && cross(x, y))), `${JSON.stringify(arcs)}: kept arcs cross`);
        assert.equal(got.reduce((s, k) => s + w[k], 0), best, JSON.stringify({ arcs, w }));
    }
});

test("an arc under the line bends down, and the picture holds it", () => {
    let entities = [polymer("1", "RNA", ["A"], 20)];
    let d = pair_arcs(entities, new Map([["1", residues_for(20)]]),
                      [pair("A", 1, "A", 10), pair("A", 2, "A", 9), pair("A", 5, "A", 15, "tWH", "nc")]);
    let [[, , up]] = arcs(d.paths.wc);
    let [[, , down]] = arcs(d.paths.nc);
    assert.ok(up < d.base && down > d.base, "control points either side of the line");
    assert.ok(down - d.base < d.base - up, "5-15 is wider than 1-10 but shallower: the room below is smaller");
    assert.ok(down * 0.75 + d.base * 0.25 <= d.bottom, "the lowest point is inside the picture");
    assert.ok(d.bottom + 14 < d.height, "names under the arcs fit too");
    let flat = pair_arcs(entities, new Map([["1", residues_for(20)]]), [pair("A", 1, "A", 10)]);
    assert.equal(flat.height, ARC_HEIGHT, "nothing below: the picture as before");
    assert.equal(flat.bottom, flat.base);
});
