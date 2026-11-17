// pick.test.js - ticking rows on the landing page (public/pick.js): how ticks
// become one search, how the bar says it in words, and that the page carries
// what the script needs. The script's DOM half is checked in the browser; its
// rules are plain functions, run here without a page.

import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { BROWSE } from "./filters.js";

const SOURCE = readFileSync(new URL("./public/pick.js", import.meta.url), "utf8");
const { pick_query, pick_summary, pick_url } =
    new Function(SOURCE + "\nreturn { pick_query, pick_summary, pick_url };")();

const row = (key, values, label) => ({ key, values, label });
const DNA = row("polymer_type", ["DNA"], "DNA");
const RNA = row("polymer_type", ["RNA"], "RNA");
const XRAY = row("experimental_method", ["X-RAY DIFFRACTION"], "X-ray");
const NMR = row("experimental_method", ["SOLUTION NMR", "SOLID-STATE NMR"], "NMR");

test("ticks of one filter merge into one list; different filters stay apart", () => {
    let q = pick_query([DNA, XRAY, RNA, NMR]);
    assert.deepEqual([...q], [["polymer_type", ["DNA", "RNA"]],
                              ["experimental_method", ["X-RAY DIFFRACTION", "SOLUTION NMR", "SOLID-STATE NMR"]]]);
    assert.deepEqual([...pick_query([DNA, DNA])], [["polymer_type", ["DNA"]]], "a value is asked once");
});

// /search reads key=a,b as either and separate keys as all, so the words must
// say exactly that, or the bar promises a different search than it runs.
test("the bar says the ticks the way the search reads them", () => {
    assert.equal(pick_summary([DNA]), "DNA");
    assert.equal(pick_summary([DNA, RNA]), "(DNA or RNA)");
    assert.equal(pick_summary([DNA, XRAY, RNA]), "(DNA or RNA) and X-ray");
    assert.equal(pick_summary([XRAY], "tRNA"), "“tRNA” and X-ray");
    assert.equal(pick_summary([XRAY], "t"), "X-ray", "one letter is not searched, so not said");
});

const BACT = row("source_organism", ["Bacteria"], "Bacteria");
const ARCH = row("source_organism", ["Archaea"], "Archaea");
const not = (r) => ({ ...r, key: "not_" + r.key });

// A No asks not_<key>, none of its values, and says so.
test("a No asks not_ its filter and the bar says not", () => {
    assert.equal(pick_summary([DNA, not(BACT)]), "DNA and not Bacteria");
    assert.equal(pick_summary([not(BACT), not(ARCH), XRAY]), "not (Bacteria or Archaea) and X-ray");
    assert.equal(pick_summary([row("source_organism", ["Eukaryota"], "Eukaryotes"), not(BACT)]),
                 "Eukaryotes and not Bacteria", "a Yes and a No of the same filter stay two parts");
    let params = new URLSearchParams(pick_url("", "", [DNA, not(BACT), not(ARCH)]));
    assert.equal(params.get("not_source_organism"), "Bacteria,Archaea");
    assert.equal(params.get("source_organism"), null);
    assert.equal(params.get("polymer_type"), "DNA");
});

test("the address runs the box and the ticks together", () => {
    let params = new URLSearchParams(pick_url("", "tRNA", [DNA, RNA, XRAY]));
    assert.equal(params.get("q"), "tRNA");
    assert.equal(params.get("polymer_type"), "DNA,RNA");
    assert.equal(params.get("experimental_method"), "X-RAY DIFFRACTION");

    assert.equal(new URLSearchParams(pick_url("", "t", [DNA])).get("q"), null);

    // A suggestion picked from the box joins the ticks, never twice.
    let picked = new URLSearchParams(pick_url("", "", [DNA], { polymer_type: "RNA", ligand: "MG" }));
    assert.equal(picked.get("polymer_type"), "DNA,RNA");
    assert.equal(picked.get("ligand"), "MG");
    assert.equal(new URLSearchParams(pick_url("", "", [DNA], { polymer_type: "DNA" })).get("polymer_type"), "DNA");
});

// pick.js reads each answer's filter from its link, as the first and only
// parameter. A link that asked two things would answer only half.
test("every landing link asks one filter, which the script reads", () => {
    let one = (url, values, label) => {
        let params = [...new URL(url, "http://x").searchParams];
        assert.equal(params.length, 1, label);
        assert.deepEqual(params[0][1].split(","), values, label);
    };
    for (const group of BROWSE) for (const r of group.rows) {
        one(r.url, Object.values(r.params)[0], r.label);
        one(r.no_url, Object.values(r.no_params)[0], r.label);
        for (const o of r.choices ?? []) one(o.url, Object.values(o.params)[0], o.label);
    }
});

test("the page carries the buttons, the bar and the script, and the bar starts hidden", () => {
    let page = readFileSync(new URL("./views/landing.ejs", import.meta.url), "utf8");
    assert.match(page, /<a class="browse_yes" href="<%= row\.url %>" data-say="<%= row\.say_yes %>">Yes<\/a>/);
    assert.match(page, /<a class="browse_no" href="<%= row\.no_url %>" data-say="<%= row\.say_no %>">No<\/a>/);
    assert.match(page, /<div class="browse_options" hidden>/, "options wait for Yes");
    assert.match(page, /<span class="browse_tick" aria-hidden="true"><\/span>/);
    assert.match(page, /<div class="pick_bar" hidden>/);
    assert.match(page, /class="pick_count" aria-live="polite"/);
    assert.ok(page.indexOf('src="/pick.js"') < page.indexOf('src="/landing.js"'));
    // "Yes" alone would mean nothing in the bar, so each says more.
    assert.match(SOURCE, /label: a\.dataset\.say \|\|/);
    // Leaving Yes closes its options and clears them.
    assert.match(SOURCE, /row\.shelf\.hidden = state !== "yes"/);
    assert.match(SOURCE, /if \(state !== "yes"\) for \(const o of row\.options\) tick\(o, false\)/);

    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    assert.match(css, /\n\.pick_bar\[hidden\] \{ display: none; \}/, "the bar's display: flex would show it while hidden");
    assert.match(css, /\n\.browse_tick \{ display: none; \}/, "without the script no box shows");
    assert.match(css, /\n\.browse_options\[hidden\] \{ display: none; \}/, "the shelf's display would show it while hidden");
});
