// search.test.js - checks that search.js still answers the way it used to.
// Run with: npm test

import test from "node:test";
import assert from "node:assert";
import entries from "./entries.json" with { type: "json" };
import { find_entry, export_entries, search_entries, query_problem } from "./search.js";


test("finds an entry by its exact id", () => {
    assert.equal(find_entry(entries, "4TNA").pdb_id, "4TNA");
});

test("ignores case, because 4tna and 4TNA are the same structure", () => {
    assert.equal(find_entry(entries, "4tna").pdb_id, "4TNA");
});

test("returns undefined for an id that does not exist", () => {
    assert.equal(find_entry(entries, "ZZZZ"), undefined);
});


// --- filtering ----------------------------------------------------------

test("no filters returns every entry", () => {
    assert.equal(export_entries(entries, {}).total, entries.length);
});

test("an unknown parameter is ignored", () => {
    assert.deepEqual(export_entries(entries, { nonsense: "x" }),
                     export_entries(entries, {}));
});


// Each row: the filter name, a value to search for, and how to read the
// matching field off an entry. One test body, run once per row.
const text_cases = [
    ["entry_id",        "tna",      (e) => e.pdb_id],
    ["author_name",     "hingerty", (e) => e.author],
    ["source_organism", "sacch",    (e) => e.source_organism]
];

for (const [field, value, read] of text_cases) {
    test(`${field} matches anywhere in the text, ignoring case`, () => {
        let found = export_entries(entries, { [field]: value }).results;

        assert.ok(found.length > 0, "the test value should match something");

        for (const entry of found) {
            assert.ok(read(entry).toLowerCase().includes(value.toLowerCase()));
        }
    });

    test(`${field} gives the same answer in upper case`, () => {
        assert.deepEqual(export_entries(entries, { [field]: value }),
                         export_entries(entries, { [field]: value.toUpperCase() }));
    });
}


test("a pill filter keeps only the chosen values", () => {
    let found = export_entries(entries, { polymer_type: "Nucleic acid" }).results;

    assert.ok(found.length > 0);
    for (const entry of found) assert.equal(entry.polymer_type, "Nucleic acid");
});

// Uses experimental_method rather than polymer_type: every entry is either
// "Nucleic acid" or "Protein/NA", so a two-pill test on that field would pass
// even with the filter removed entirely.
test("two pills mean either one, and nothing else", () => {
    let a = "SOLUTION NMR";
    let b = "X-RAY DIFFRACTION";

    let only_a = export_entries(entries, { experimental_method: a }).total;
    let only_b = export_entries(entries, { experimental_method: b }).total;
    let either = export_entries(entries, { experimental_method: `${a},${b}` });

    // A method is one value per entry, so the two sets cannot overlap.
    assert.equal(either.total, only_a + only_b);

    // And it must still exclude something, or the filter is doing nothing.
    assert.ok(either.total < entries.length, "two pills should not match everything");

    for (const entry of either.results) {
        assert.ok([a, b].includes(entry.method));
    }
});

test("two different filters must both hold", () => {
    let found = export_entries(entries, {
        entry_id: "tna",
        polymer_type: "Nucleic acid"
    }).results;

    for (const entry of found) {
        assert.ok(entry.pdb_id.toLowerCase().includes("tna"));
        assert.equal(entry.polymer_type, "Nucleic acid");
    }
});

// Documents a known limitation rather than a bug: confal_score is null for
// every entry until DNATCO data is loaded, so any confal filter excludes all.
test("a confal filter matches nothing while DNATCO data is missing", () => {
    assert.equal(export_entries(entries, { confal_min: "0" }).total, 0);
});


// --- paging -------------------------------------------------------------

test("a page holds no more than the page size", () => {
    let first = search_entries(entries, {});

    assert.equal(first.results.length, first.page_size);
    assert.equal(first.page, 1);
});

test("pages is the total divided by page size, rounded up", () => {
    let r = search_entries(entries, {});

    assert.equal(r.pages, Math.ceil(r.total / r.page_size));
});

// The unfiltered total divides evenly by the page size, so rounding down
// instead of up is invisible above. This uses a filter that leaves a
// remainder, and checks the behaviour rounding would break: the last page
// must exist and hold the leftovers.
test("the last page is reachable when the total does not divide evenly", () => {
    let query = { source_organism: "sacch" };
    let r = search_entries(entries, query);

    assert.ok(r.total % r.page_size !== 0,
        "this filter must leave a remainder, or the test proves nothing");

    assert.equal(r.pages, Math.ceil(r.total / r.page_size));

    let last = search_entries(entries, { ...query, page: String(r.pages) });
    assert.ok(last.results.length > 0, "the last page must hold the remainder");

    let past = search_entries(entries, { ...query, page: String(r.pages + 1) });
    assert.equal(past.results.length, 0, "there must be nothing after the last page");
});

// The important one. Off-by-one slicing shows up here and almost nowhere else.
test("walking every page yields every entry exactly once, in order", () => {
    let all = export_entries(entries, {}).results;
    let walked = [];

    for (let page = 1; page <= search_entries(entries, {}).pages; page++) {
        walked.push(...search_entries(entries, { page: String(page) }).results);
    }

    assert.deepEqual(walked, all);
});

test("a page past the end is empty but still reports the true total", () => {
    let r = search_entries(entries, { page: "999" });

    assert.equal(r.results.length, 0);
    assert.equal(r.total, entries.length);
    assert.equal(r.pages, Math.ceil(entries.length / r.page_size));
});

// The floor, not the gate: even unvalidated nonsense must not crash.
const bad_pages = ["abc", "0", "-5", "", "999999999999"];

for (const value of bad_pages) {
    test(`page="${value}" never crashes and never returns a broken page`, () => {
        let r = search_entries(entries, { page: value });

        assert.ok(Number.isInteger(r.page) && r.page >= 1);
        assert.ok(Array.isArray(r.results));
    });
}


// Checked against a list sorted here, not against another call to search.js.
// The walking test above compares one result to another, so both sides share
// matching_entries() and a broken sort cancels out.
test("results come back in id order", () => {
    let ids = export_entries(entries, {}).results.map((e) => e.pdb_id);
    let expected = [...ids].sort((a, b) => a.localeCompare(b));

    assert.deepEqual(ids, expected);
});

test("the first page starts at the first id overall", () => {
    let all_ids = entries.map((e) => e.pdb_id).sort((a, b) => a.localeCompare(b));

    assert.equal(search_entries(entries, {}).results[0].pdb_id, all_ids[0]);
});


// --- export -------------------------------------------------------------

test("export returns every match, not one page", () => {
    let r = export_entries(entries, {});

    assert.equal(r.results.length, entries.length);
    assert.ok(r.results.length > search_entries(entries, {}).page_size);
});

test("export is not truncated at this size", () => {
    assert.equal(export_entries(entries, {}).truncated, false);
});


// --- validation ---------------------------------------------------------

test("a query with nothing wrong returns null", () => {
    assert.equal(query_problem({}), null);
    assert.equal(query_problem({ page: "2", confal_min: "2", confal_max: "9" }), null);
});

// Each row: a bad query, and part of the message it should produce.
// Matching on a fragment means the wording can improve without breaking tests.
const bad_queries = [
    [{ page: "abc" },                      /whole number/],
    [{ page: "0" },                        /whole number/],
    [{ page: "-1" },                       /whole number/],
    [{ page: "2.9" },                      /whole number/],
    [{ confal_min: "x" },                  /confal_min must be a number/],
    [{ confal_max: "y" },                  /confal_max must be a number/],
    [{ confal_min: "9", confal_max: "2" }, /cannot be higher/]
];

for (const [query, expected] of bad_queries) {
    test(`rejects ${JSON.stringify(query)}`, () => {
        assert.match(query_problem(query), expected);
    });
}

// The gate rejects it; the floor survives it anyway.
test("the gate and the floor disagree on purpose", () => {
    assert.ok(query_problem({ page: "2.9" }), "the gate should reject a fractional page");
    assert.equal(search_entries(entries, { page: "2.9" }).page, 2);
});
