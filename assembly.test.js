// assembly.test.js - the arc picture of a biological assembly: which chains,
// which copies, which pairs. No database: the operators and assemblies are
// shaped like real ones (1TTT, 1EN9, 4NH6, 4OPJ, 1BMV), small enough to read.

import test from "node:test";
import assert from "node:assert";
import { assembly_pairs, expression_ops, identity_op, arc_views, pair_arcs,
         ARC_PAIR_MAX, ARC_MANY_STRANDS, AU } from "./detail.js";

// [r11, r12, r13, t1, r21, r22, r23, t2, r31, r32, r33, t3]
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const shift = (x) => [1, 0, 0, x, 0, 1, 0, 0, 0, 0, 1, 0];
const TWOFOLD = [-1, 0, 0, 40, 0, -1, 0, 0, 0, 0, 1, 0];     // -x+40, -y, z: twice is I
const ops = (o) => new Map(Object.entries(o));

const rna = (labels, length) => [{ id: "1", kind: "RNA", length, chains: labels.map((label) => ({ label, auth: label })) }];
const residues = (length) => new Map([["1", Array.from({ length }, (_, i) => ({ pos: i + 1 }))]]);
const pair = (label_1, pos_1, label_2, pos_2, copy_1 = "1", copy_2 = "1") =>
    ({ label_1, pos_1, label_2, pos_2, copy_1, copy_2, family: "cWW", kind: "wc", res_1: `G${pos_1}`, res_2: `C${pos_2}` });
const strands = (arcs) => arcs.chains.map((c) => c.name);

test("an operator expression gives every operator it names, a product as pairs", () => {
    let o = ops({ 1: I, 2: TWOFOLD, 3: shift(5), X0: shift(100) });
    assert.deepEqual(expression_ops("1", o).map((x) => x.key), ["1"]);
    assert.deepEqual(expression_ops("1,2", o).map((x) => x.key), ["1", "2"]);
    assert.deepEqual(expression_ops("(1-3)", o).map((x) => x.key), ["1", "2", "3"]);
    let product = expression_ops("(X0)(1,3)", o);
    assert.deepEqual(product.map((x) => x.key), ["X0×1", "X0×3"]);
    assert.deepEqual(product[1].m, shift(105), "3 first, then X0");
    // A turn and a shift do not commute: X0 after 3 is -(x+5)+40 = -x+35.
    let turned = expression_ops("(2)(3)", o)[0];
    assert.equal(turned.key, "2×3");
    assert.deepEqual(turned.m, [-1, 0, 0, 35, 0, -1, 0, 0, 0, 0, 1, 0]);
    assert.throws(() => expression_ops("1,4", o), /operator 4 of 1,4 is not in the list/);
});

test("the identity is found by its matrix, not by being called 1", () => {
    assert.equal(identity_op(ops({ 1: TWOFOLD, 2: I })), "2", "4NH6: 1 is a crystal symmetry");
    assert.equal(identity_op(ops({ 1: I, 2: TWOFOLD })), "1");
    assert.equal(identity_op(new Map()), "1", "no operators known: the old rule");
});

test("1TTT: three complexes in the file, assembly 1 keeps only its own", () => {
    let o = ops({ 1: I });
    let assembly = { id: "1", gens: [{ expr: "1", chains: ["A"] }] };
    let pairs = [pair("A", 1, "A", 10), pair("A", 2, "A", 9), pair("B", 1, "B", 10), pair("A", 5, "B", 5)];
    let v = assembly_pairs(assembly, o, pairs);
    assert.deepEqual(v.pairs.map((p) => `${p.label_1}${p.pos_1}-${p.label_2}${p.pos_2}`), ["A1-A10", "A2-A9"],
                     "the other complex and the contact between them are left out");
});

test("1EN9: half a duplex in the file, the assembly builds the other strand", () => {
    let o = ops({ 1: I, 2: TWOFOLD });
    let assembly = { id: "1", gens: [{ expr: "1,2", chains: ["A"] }] };
    // As the file lists them: always from the chain's own copy.
    let pairs = [pair("A", 1, "A", 8, "1", "2"), pair("A", 2, "A", 7, "1", "2")];
    let v = assembly_pairs(assembly, o, pairs);
    assert.deepEqual(v.pairs.map((p) => `${p.copy_1}:${p.pos_1}-${p.copy_2}:${p.pos_2}`),
                     ["1:1-2:8", "2:1-1:8", "1:2-2:7", "2:2-1:7"], "each pair on both copies");
    let arcs = pair_arcs(rna(["A"], 8), residues(8), v.pairs, v);
    assert.deepEqual(strands(arcs), ["A", "A′"]);
    assert.equal(arcs.counts.drawn, 4);
});

test("4NH6: operator 2 is the chain itself, so the copy under 1 is the primed one", () => {
    let o = ops({ 1: TWOFOLD, 2: I });
    let pairs = [pair("B", 1, "B", 8, "2", "1")];
    let au = pair_arcs(rna(["B"], 8), residues(8), pairs, { identity: identity_op(o) });
    assert.deepEqual(au.chains.map((c) => [c.name, c.copy, c.symmetry]), [["B", "2", false], ["B′", "1", true]]);
    let v = assembly_pairs({ id: "1", gens: [{ expr: "1", chains: ["B"] }, { expr: "2", chains: ["B"] }] }, o, pairs);
    let built = pair_arcs(rna(["B"], 8), residues(8), v.pairs, v);
    assert.deepEqual(built.chains.map((c) => [c.name, c.copy]), [["B", "2"], ["B′", "1"]]);
});

test("4OPJ: one pair listed twice, a cell apart, is drawn once", () => {
    let o = ops({ 1: shift(42), 2: I, 3: shift(-42) });
    let assembly = { id: "1", gens: [{ expr: "1", chains: ["B"] }, { expr: "2", chains: ["A"] }] };
    let pairs = [pair("A", 1, "B", 6, "2", "1"), pair("A", 1, "B", 6, "3", "2")];
    let v = assembly_pairs(assembly, o, pairs);
    let arcs = pair_arcs([{ id: "1", kind: "DNA", length: 6, chains: [{ label: "A" }, { label: "B" }] }], residues(6), v.pairs, v);
    assert.deepEqual(strands(arcs), ["A", "B"], "B's one copy is B, though it is moved");
    assert.equal(arcs.counts.drawn, 1);
});

test("4OPJ: a pair listed only from a moved copy is still found", () => {
    let o = ops({ 1: shift(42), 2: I, 3: shift(-42) });
    let assembly = { id: "1", gens: [{ expr: "1", chains: ["B"] }, { expr: "2", chains: ["A"] }] };
    // A moved by -42 pairs with B as filed: so A as filed pairs with B moved by +42.
    let v = assembly_pairs(assembly, o, [pair("A", 1, "B", 6, "3", "2")]);
    assert.deepEqual(v.pairs.map((p) => [p.copy_1, p.copy_2]), [["2", "1"]]);
});

test("a pair whose partner the assembly does not build is dropped", () => {
    let o = ops({ 1: I, 2: TWOFOLD, 3: shift(30) });
    let v = assembly_pairs({ id: "1", gens: [{ expr: "1,2", chains: ["A"] }] }, o, [pair("A", 1, "A", 8, "1", "3")]);
    assert.deepEqual(v.pairs, []);
});

test("arc_views: assembly 1 first, the asymmetric unit as the other choice", () => {
    let o = ops({ 1: I, 2: TWOFOLD });
    let asm = { assemblies: [{ id: "1", gens: [{ expr: "1", chains: ["A"] }] },
                             { id: "2", gens: [{ expr: "1", chains: ["B"] }] }], opers: o };
    let pairs = [pair("A", 1, "A", 10), pair("B", 1, "B", 10), pair("B", 2, "B", 9)];
    let ents = rna(["A", "B"], 10), res = residues(10);

    let first = arc_views(ents, res, pairs, asm, "");
    assert.equal(first.key, "1");
    assert.ok(first.assembly);
    assert.deepEqual(strands(first.arcs), ["A"]);
    assert.deepEqual(first.options.map((x) => [x.key, x.label, x.current]),
                     [["1", "Assembly 1", true], ["2", "Assembly 2", false], [AU, "Asymmetric unit", false]]);
    assert.equal(first.au.counts.drawn, 3, "the deposited pairs, for counts");

    assert.deepEqual(strands(arc_views(ents, res, pairs, asm, "2").arcs), ["B"]);
    let au = arc_views(ents, res, pairs, asm, AU);
    assert.equal(au.key, AU);
    assert.ok(!au.assembly);
    assert.deepEqual(strands(au.arcs), ["A", "B"]);
    assert.equal(arc_views(ents, res, pairs, asm, "9").key, "1", "an unknown choice falls back to assembly 1");
    assert.equal(arc_views(ents, res, pairs, asm, "<x>").key, "1");
});

test("arc_views: no choice when every view draws the same picture", () => {
    let asm = { assemblies: [{ id: "1", gens: [{ expr: "1", chains: ["A"] }] }], opers: ops({ 1: I }) };
    let v = arc_views(rna(["A"], 10), residues(10), [pair("A", 1, "A", 10)], asm, "");
    assert.equal(v.key, "1");
    assert.deepEqual(v.options, []);
    assert.equal(v.note, null);
});

test("arc_views: without assembly rows (the test seed) it is the asymmetric unit, as before", () => {
    let pairs = [pair("A", 1, "A", 10)];
    let v = arc_views(rna(["A"], 10), residues(10), pairs, undefined, "");
    assert.equal(v.key, AU);
    assert.deepEqual(v.options, []);
    assert.deepEqual(v.arcs, pair_arcs(rna(["A"], 10), residues(10), pairs));
});

test("arc_views: an assembly too big to draw falls back to the asymmetric unit, and says so", () => {
    let o = ops({ 1: I, 2: TWOFOLD });
    let asm = { assemblies: [{ id: "1", gens: [{ expr: "1,2", chains: ["A"] }] }], opers: o };
    let n = ARC_PAIR_MAX / 2 + 1;
    let pairs = Array.from({ length: n }, (_, k) => pair("A", 1 + (k % 50), "A", 100 - (k % 50)));
    let v = arc_views(rna(["A"], 100), residues(100), pairs, asm, "");
    assert.equal(v.key, AU);
    assert.match(v.note.text, /^Assembly 1 has 10,002 base pairs, too many to draw, so this is the asymmetric unit\.$/);
    assert.equal(arc_views(rna(["A"], 100), residues(100), pairs, asm, AU).note, null, "asked for: no excuse needed");
});

test("arc_views: an assembly of many strands points to the asymmetric unit", () => {
    let n = ARC_MANY_STRANDS + 1;
    let o = ops(Object.fromEntries(Array.from({ length: n }, (_, k) => [String(k + 1), shift(50 * k)])));
    let asm = { assemblies: [{ id: "1", gens: [{ expr: `(1-${n})`, chains: ["A"] }] }], opers: o };
    let v = arc_views(rna(["A"], 10), residues(10), [pair("A", 1, "A", 10)], asm, "");
    assert.equal(v.arcs.chains.length, n);
    assert.deepEqual(v.note, { text: `Assembly 1 has ${n} strands.`, link: AU, link_text: "The asymmetric unit is easier to read." });
});

test("arc_views: the picture shown puts crossing pairs under the line, in any view", () => {
    let asm = { assemblies: [{ id: "1", gens: [{ expr: "1", chains: ["A"] }] }], opers: ops({ 1: I }) };
    let pairs = [pair("A", 1, "A", 10), pair("A", 2, "A", 9), { ...pair("A", 5, "A", 15), family: "tWH", kind: "nc" }];
    for (const asked of ["", AU]) {
        let v = arc_views(rna(["A"], 20), residues(20), pairs, asm, asked);
        assert.deepEqual(v.arcs.layout.pairs.map((p) => p[7] === 1), [false, false, true], `view ${v.key}`);
        assert.equal(v.arcs.below, 1);
    }
});

test("arc_views: a line under the picture says what the view changes, only when it does", () => {
    let o = ops({ 1: I, 2: TWOFOLD });
    let res = residues(20);
    // 1TTT: the file holds A and B; assembly 1 is A alone.
    let split = { assemblies: [{ id: "1", gens: [{ expr: "1", chains: ["A"] }] }, { id: "2", gens: [{ expr: "1", chains: ["B"] }] }], opers: o };
    let two = [pair("A", 1, "A", 10), pair("B", 1, "B", 10)];
    assert.deepEqual(arc_views(rna(["A", "B"], 20), res, two, split, "").about, ["The file holds 2 strands; assembly 1 uses 1 of them."]);
    assert.deepEqual(arc_views(rna(["A", "B"], 20), res, two, split, AU).about, [], "the file itself: nothing to explain");
    // 1EN9: the assembly builds the other strand.
    let built = { assemblies: [{ id: "1", gens: [{ expr: "1,2", chains: ["A"] }] }], opers: o };
    assert.deepEqual(arc_views(rna(["A"], 8), residues(8), [pair("A", 1, "A", 8, "1", "2")], built, "").about,
                     ["Assembly 1 builds 1 strand by symmetry, drawn dashed."]);
    assert.deepEqual(arc_views(rna(["A"], 8), residues(8), [pair("A", 1, "A", 8, "1", "2")], built, AU).about, [],
                     "the file's own crystal copy is the page's ′ note, not an assembly's line");
    // Same picture either way, nothing crossing: no line at all.
    let same = { assemblies: [{ id: "1", gens: [{ expr: "1", chains: ["A"] }] }], opers: ops({ 1: I }) };
    assert.deepEqual(arc_views(rna(["A"], 20), res, [pair("A", 1, "A", 10)], same, "").about, []);
    let crossing = [pair("A", 1, "A", 10), pair("A", 2, "A", 9), { ...pair("A", 5, "A", 15), family: "tWH", kind: "nc" }];
    assert.deepEqual(arc_views(rna(["A"], 20), res, crossing, same, "").about, ["Under the line: pairs that cross the ones above."]);
    let v = arc_views(rna(["A", "B"], 20), res, two, split, "");
    assert.ok(v.options.every((x) => x.title.length > 10), "every choice says what it is on hover");
    assert.notEqual(v.options[0].title, v.options.at(-1).title);
});
