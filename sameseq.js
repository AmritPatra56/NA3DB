// Same sequence in other entries: which chains share this chain's sequence
// letter for letter, and what differs between any two of them.
//
// Two chains are compared only when their polymer type and canonical
// sequence are identical, so position k is the same nucleotide in both and
// the label seq_id lines them up with no alignment. Everything here is pure:
// the rows come from search.js.

import { flip_lw, layer_rows, nucleotide_letter } from "./detail.js";

// A sequence takes part only when it is plain A, C, G, T or U. N, X and the
// like stand for "unknown", so two N's need not be the same nucleotide.
export function sequence_key(type, sequence) {
    let seq = String(sequence ?? "").replace(/\s/g, "").toUpperCase();
    if (!type || !/^[ACGTU]+$/.test(seq)) return null;
    return `${String(type).toLowerCase()}\n${seq}`;
}

// A pair seen in both chains counts towards "same fold" when at least this
// share of the comparable pairs is in both.
export const SAME_FOLD = 0.85;
// A backbone step differs only when both are assigned with at least this
// confidence; below it the class is a guess and a change means little.
export const CONFAL_MIN = 50;

export const CANA_WORDS = {
    AAA: "A-form family", AAw: "A-form family", AAu: "A-form family",
    BBB: "B-form family", BBw: "B-form family", miB: "B-form family", BB2: "B-form family",
    "A-B": "transition", "B-A": "transition", B12: "transition",
    ZZZ: "Z-form", ICL: "intercalated", OPN: "opened", SYN: "syn base", NAN: "no NtC class"
};

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const assigned = (s) => s && s.ntc && s.ntc !== "NANT";
const sure = (s) => assigned(s) && s.confal !== null && s.confal !== undefined && Number(s.confal) >= CONFAL_MIN;

// One chain as the comparison reads it: by position, its pairs normalised to
// i < j and each listed once, its steps to the next nucleotide.
function chain_view(chain, index) {
    let res = new Array(index.size);
    for (const r of chain.residues) res[index.get(Number(r.pos))] = r;
    let pairs = new Map();
    for (const p of chain.pairs) {
        let i = index.get(Number(p.pos_1));
        let j = index.get(Number(p.pos_2));
        if (i === undefined || j === undefined || i === j) continue;
        let family = p.family;
        if (i > j) [i, j, family] = [j, i, flip_lw(family)];
        let key = `${i} ${j} ${family}`;
        if (!pairs.has(key)) pairs.set(key, { i, j, family, kind: p.kind });
    }
    let steps = new Map();
    for (const s of chain.steps) {
        let i = index.get(Number(s.pos_1));
        if (i === undefined || index.get(Number(s.pos_2)) !== i + 1 || steps.has(i)) continue;
        steps.set(i, { ntc: assigned(s) ? s.ntc : null, cana: assigned(s) ? s.cana : "NAN",
                       confal: s.confal === null || s.confal === undefined ? null : Number(s.confal) });
    }
    return { res, pairs, steps, seen: (i) => res[i]?.seen !== false };
}

const family_of = (cana) => CANA_WORDS[cana] ?? cana;
const step_words = (s) => `${s.cana} (${s.ntc}, confal ${Math.round(s.confal)})`;

// Every difference between chains a and b, numbered by position, and what the
// picture needs to draw both: steps above and below, and the pairs of both in
// one set of dot-bracket rows, each pair marked "=" (in both), "a" or "b"
// (only in that chain) or "n" (only in one, and the other chain does not
// model one of its two nucleotides, so it cannot be compared). picture:
// false skips the rows, for callers that only read the summary.
export function compare_chains(a, b, { picture = true } = {}) {
    let positions = a.residues.map((r) => Number(r.pos)).sort((x, y) => x - y);
    let other = b.residues.map((r) => Number(r.pos)).sort((x, y) => x - y);
    if (positions.length !== other.length || positions.some((p, k) => p !== other[k])) {
        throw new Error("chains with different residues cannot be compared");
    }
    let index = new Map(positions.map((p, k) => [p, k]));
    let A = chain_view(a, index);
    let B = chain_view(b, index);
    let n = positions.length;

    let cols = Array.from({ length: n }, (_, i) => {
        let ra = A.res[i], rb = B.res[i];
        let letter = nucleotide_letter({ ...ra, modified: ra.modified || rb.modified });
        return [letter, ra.num ?? String(i + 1), rb.num ?? String(i + 1), A.seen(i) ? 1 : 0, B.seen(i) ? 1 : 0,
                ra.code, rb.code];
    });
    // A nucleotide is named by its author number when both chains number it
    // alike, as tRNA's U8 or G18; otherwise by its place on the ruler, and
    // the detail says how each chain numbers it.
    let same_num = (i) => cols[i][1] === cols[i][2];
    let name_of = (i) => `${cols[i][0].toUpperCase()}${same_num(i) ? cols[i][1] : i + 1}`;
    let numbered = (is) => is.every(same_num) ? ""
        : ` · ${a.name} numbers ${is.map((i) => cols[i][1]).join(", ")}, ${b.name} ${is.map((i) => cols[i][2]).join(", ")}`;

    // The pairs of both, each once.
    let union = new Map();
    for (const [side, view] of [["a", A], ["b", B]]) {
        for (const [key, p] of view.pairs) {
            let u = union.get(key) ?? { ...p, in_a: false, in_b: false };
            u["in_" + side] = true;
            union.set(key, u);
        }
    }
    let shared = 0, only_a = 0, only_b = 0, not_comparable = 0;
    let placed = [];
    for (const u of union.values()) {
        let who = u.in_a && u.in_b ? "="
            : u.in_a ? (B.seen(u.i) && B.seen(u.j) ? "a" : "n")
            : (A.seen(u.i) && A.seen(u.j) ? "b" : "n");
        u.who = who;
        if (who === "=") shared++;
        else if (who === "a") only_a++;
        else if (who === "b") only_b++;
        else not_comparable++;
        placed.push({ i: u.i, j: u.j, family: u.family, who,
                      row: u.family === "cWW" ? (u.kind === "wc" ? "WC" : "cWW") : u.family });
    }
    let rows = !picture ? [] : layer_rows(placed, n).map((r) => ({
        name: r.name, family: r.family, overflow: !!r.overflow, text: r.text,
        pairs: r.pairs.map((p) => [p.i, p.j, p.who])
    }));

    // The differences. A pair that is in both chains but of another family
    // in each is one difference, not two.
    let diffs = [];
    let at = new Map();
    for (const u of union.values()) {
        if (u.who !== "a" && u.who !== "b") continue;
        let key = `${u.i} ${u.j}`;
        if (!at.has(key)) at.set(key, { a: [], b: [], shared: false });
        at.get(key)[u.who].push(u.family);
    }
    for (const u of union.values()) if (u.who === "=" && at.has(`${u.i} ${u.j}`)) at.get(`${u.i} ${u.j}`).shared = true;
    for (const [key, f] of at) {
        let [i, j] = key.split(" ").map(Number);
        let where = `${name_of(i)} and ${name_of(j)}`;
        if (f.a.length && f.b.length && !f.shared) {
            diffs.push({ kind: "pair_changed", i, j, cols: [i, j],
                         text: `${where} pair in both, but in a different way.`,
                         detail: `${a.name}: ${f.a.join(", ")} · ${b.name}: ${f.b.join(", ")}${numbered([i, j])}` });
            continue;
        }
        for (const [side, mine, theirs] of [["a", a, b], ["b", b, a]]) {
            if (!f[side].length) continue;
            diffs.push({ kind: "pair_" + side, i, j, cols: [i, j],
                         text: f.shared ? `${where} pair in both, and also another way in ${mine.name}.`
                                        : `${where} pair only in ${mine.name}.`,
                         detail: `${f[side].join(", ")} · ${theirs.name} models both but does not pair them${numbered([i, j])}` });
        }
    }
    let steps_compared = 0, steps_differ = 0;
    for (let i = 0; i < n - 1; i++) {
        let sa = A.steps.get(i), sb = B.steps.get(i);
        if (!assigned(sa) || !assigned(sb)) continue;
        steps_compared++;
        if (!sure(sa) || !sure(sb) || sa.cana === sb.cana) continue;
        steps_differ++;
        diffs.push({ kind: "step", i, j: i + 1, cols: [i, i + 1],
                     text: family_of(sa.cana) === family_of(sb.cana)
                         ? `The backbone from ${name_of(i)} to ${name_of(i + 1)} differs slightly, ${family_of(sa.cana)} in both.`
                         : `The backbone from ${name_of(i)} to ${name_of(i + 1)} takes another shape.`,
                     detail: `${a.name}: ${family_of(sa.cana) === family_of(sb.cana) ? "" : family_of(sa.cana) + ", "}${step_words(sa)} · ` +
                             `${b.name}: ${family_of(sa.cana) === family_of(sb.cana) ? "" : family_of(sb.cana) + ", "}${step_words(sb)}${numbered([i, i + 1])}` });
    }
    let chemistry = 0;
    for (let i = 0; i < n; i++) {
        let ca = cols[i][5], cb = cols[i][6];
        if (ca === cb) continue;
        chemistry++;
        let said = (r) => (r.chem ? `${r.code} (${r.chem})` : r.code);
        diffs.push({ kind: "chem", i, cols: [i],
                     text: `${name_of(i)} is a different nucleotide.`,
                     detail: `${a.name}: ${said(A.res[i])} · ${b.name}: ${said(B.res[i])}${numbered([i])}` });
    }
    let order = { chem: 0, pair_changed: 1, pair_a: 1, pair_b: 1, step: 2 };
    diffs.sort((x, y) => x.i - y.i || order[x.kind] - order[y.kind] || (x.j ?? 0) - (y.j ?? 0));
    diffs.forEach((d, k) => { d.n = k + 1; });

    let unmodelled_a = 0, unmodelled_b = 0;
    for (let i = 0; i < n; i++) {
        if (!A.seen(i)) unmodelled_a++;
        if (!B.seen(i)) unmodelled_b++;
    }
    let comparable = shared + only_a + only_b;
    let count = diffs.length;
    let verdict = !count ? "same"
        : !comparable ? "no_pairs"
        : shared / comparable >= SAME_FOLD ? "same_fold" : "different_fold";
    let headline = {
        same: "No differences",
        same_fold: `Same fold, ${plural(count, "difference")}`,
        different_fold: `Different fold, ${plural(count, "difference")}`,
        no_pairs: `${plural(count, "difference")}, no base pairs to compare`
    }[verdict];
    let facts = [];
    if (comparable) facts.push(`${shared} of ${plural(comparable, "base pair")} in both`);
    if (steps_compared) facts.push(`${steps_differ} of ${plural(steps_compared, "backbone step")} differ`);
    if (chemistry) facts.push(plural(chemistry, "nucleotide") + " chemically different");
    let gaps = [[a, unmodelled_a], [b, unmodelled_b]].filter(([, k]) => k)
        .map(([c, k]) => `${c.name} does not model ${plural(k, "nucleotide")}`);
    facts.push(...gaps);

    let steps_of = (view) => [...view.steps.entries()].sort((x, y) => x[0] - y[0])
        .map(([i, s]) => [i, s.cana, s.confal, s.ntc]);
    return {
        a: a.name, b: b.name, length: n, cols,
        steps: { a: steps_of(A), b: steps_of(B) },
        rows, diffs,
        summary: { verdict, headline, facts, differences: count, shared, only_a, only_b, not_comparable,
                   comparable, steps_compared, steps_differ, chemistry, unmodelled_a, unmodelled_b }
    };
}

// How a chain ranks as "the best model" of a sequence: the best resolution
// first, then the most confident backbone, then the most of it modelled.
export function best_rank(x, y) {
    let r = (c) => (c.resolution === null || c.resolution === undefined ? Infinity : Number(c.resolution));
    return r(x) - r(y) || (Number(y.confal ?? -1) - Number(x.confal ?? -1)) || (y.seen ?? 0) - (x.seen ?? 0);
}
