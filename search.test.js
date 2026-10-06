// search.test.js - checks that search.js still answers the way it used to.
// Run with: npm test

import test, { after } from "node:test";
import assert from "node:assert";
import { close } from "./db.js";
import entries from "./entries.json" with { type: "json" };
import { find_entry, export_entries, search_entries, query_problem,
         build_where } from "./search.js";
import { query, transaction, close as close_db } from "./db.js";

// search.js now holds database connections. Without this, npm test never exits.
after(() => close_db());


test("finds an entry by its exact id", async () => {
    assert.equal((await find_entry("4TNA")).pdb_id, "4TNA");
});

test("ignores case, because 4tna and 4TNA are the same structure", async () => {
    assert.equal((await find_entry("4tna")).pdb_id, "4TNA");
});

test("returns undefined for an id that does not exist", async () => {
    assert.equal(await find_entry("ZZZZ"), undefined);
});


// --- filtering ----------------------------------------------------------

test("no filters returns every entry", async () => {
    assert.equal((await export_entries({})).total, entries.length);
});

test("an unknown parameter is ignored", async () => {
    assert.deepEqual(await export_entries({ nonsense: "x" }),
                     await export_entries({}));
});


// Each row: the filter name, a value to search for, and how to read the
// matching field off an entry. One test body, run once per row.
const text_cases = [
    ["entry_id",        "tna",      (e) => e.pdb_id],
    ["author_name",     "hingerty", (e) => e.author],
    ["source_organism", "sacch",    (e) => e.source_organism]
];

for (const [field, value, read] of text_cases) {
    test(`${field} matches anywhere in the text, ignoring case`, async () => {
        let found = (await export_entries({ [field]: value })).results;

        assert.ok(found.length > 0, "the test value should match something");

        for (const entry of found) {
            assert.ok(read(entry).toLowerCase().includes(value.toLowerCase()));
        }
    });

    test(`${field} gives the same answer in upper case`, async () => {
        assert.deepEqual(await export_entries({ [field]: value }),
                         await export_entries({ [field]: value.toUpperCase() }));
    });
}


test("a pill filter keeps only the chosen values", async () => {
    let found = (await export_entries({ polymer_type: "Nucleic acid" })).results;

    assert.ok(found.length > 0);
    for (const entry of found) assert.equal(entry.polymer_type, "Nucleic acid");
});

// experimental_method, not polymer_type: every entry is one of two polymer
// types, so that test would pass with the filter removed.
test("two pills mean either one, and nothing else", async () => {
    let a = "SOLUTION NMR";
    let b = "X-RAY DIFFRACTION";

    let only_a = (await export_entries({ experimental_method: a })).total;
    let only_b = (await export_entries({ experimental_method: b })).total;
    let either = await export_entries({ experimental_method: `${a},${b}` });

    // A method is one value per entry, so the two sets cannot overlap.
    assert.equal(either.total, only_a + only_b);

    // And it must still exclude something, or the filter is doing nothing.
    assert.ok(either.total < entries.length, "two pills should not match everything");

    for (const entry of either.results) {
        assert.ok([a, b].includes(entry.method));
    }
});

test("two different filters must both hold", async () => {
    let found = (await export_entries({
        entry_id: "tna",
        polymer_type: "Nucleic acid"
    })).results;

    for (const entry of found) {
        assert.ok(entry.pdb_id.toLowerCase().includes("tna"));
        assert.equal(entry.polymer_type, "Nucleic acid");
    }
});

// Documents a known limitation rather than a bug: confal_score is null for
// every entry until DNATCO data is loaded, so any confal filter excludes all.
test("a confal filter matches nothing while DNATCO data is missing", async () => {
    assert.equal((await export_entries({ confal_min: "0" })).total, 0);
});


// --- paging -------------------------------------------------------------

test("a page holds no more than the page size", async () => {
    let first = await search_entries({});

    assert.equal(first.results.length, first.page_size);
    assert.equal(first.page, 1);
});

test("pages is the total divided by page size, rounded up", async () => {
    let r = await search_entries({});

    assert.equal(r.pages, Math.ceil(r.total / r.page_size));
});

// The unfiltered total divides evenly, hiding a round-down bug. This uses a
// filter that leaves a remainder, so the last page must hold the leftovers.
test("the last page is reachable when the total does not divide evenly", async () => {
    let query = { source_organism: "sacch" };
    let r = await search_entries(query);

    assert.ok(r.total % r.page_size !== 0,
        "this filter must leave a remainder, or the test proves nothing");

    assert.equal(r.pages, Math.ceil(r.total / r.page_size));

    let last = await search_entries({ ...query, page: String(r.pages) });
    assert.ok(last.results.length > 0, "the last page must hold the remainder");

    let past = await search_entries({ ...query, page: String(r.pages + 1) });
    assert.equal(past.results.length, 0, "there must be nothing after the last page");
});

// The important one. Off-by-one slicing shows up here and almost nowhere else.
test("walking every page yields every entry exactly once, in order", async () => {
    let all = (await export_entries({})).results;
    let walked = [];

    for (let page = 1; page <= (await search_entries({})).pages; page++) {
        walked.push(...(await search_entries({ page: String(page) })).results);
    }

    assert.deepEqual(walked, all);
});

test("a page past the end is empty but still reports the true total", async () => {
    let r = await search_entries({ page: "999" });

    assert.equal(r.results.length, 0);
    assert.equal(r.total, entries.length);
    assert.equal(r.pages, Math.ceil(entries.length / r.page_size));
});

// The floor, not the gate: even unvalidated nonsense must not crash.
const bad_pages = ["abc", "0", "-5", "", "999999999999"];

for (const value of bad_pages) {
    test(`page="${value}" never crashes and never returns a broken page`, async () => {
        let r = await search_entries({ page: value });

        assert.ok(Number.isInteger(r.page) && r.page >= 1);
        assert.ok(Array.isArray(r.results));
    });
}


// Sorted here rather than by a second call to search.js, where a broken sort
// would appear on both sides and cancel out.
test("results come back in id order", async () => {
    let ids = (await export_entries({})).results.map((e) => e.pdb_id);
    let expected = [...ids].sort((a, b) => a.localeCompare(b));

    assert.deepEqual(ids, expected);
});

test("the first page starts at the first id overall", async () => {
    let all_ids = entries.map((e) => e.pdb_id).sort((a, b) => a.localeCompare(b));

    assert.equal((await search_entries({})).results[0].pdb_id, all_ids[0]);
});


// --- export -------------------------------------------------------------

test("export returns every match, not one page", async () => {
    let r = await export_entries({});

    assert.equal(r.results.length, entries.length);
    assert.ok(r.results.length > (await search_entries({})).page_size);
});

test("export is not truncated at this size", async () => {
    assert.equal((await export_entries({})).truncated, false);
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
test("the gate and the floor disagree on purpose", async () => {
    assert.ok(query_problem({ page: "2.9" }), "the gate should reject a fractional page");
    assert.equal((await search_entries({ page: "2.9" })).page, 2);
});


// --- the SQL WHERE builder ----------------------------------------------
// build_where's output run against the database, checked against the answers
// the JavaScript version gives.

// Runs a filter against the database and returns how many entries match.
async function count(filters) {
    let { where, values } = build_where(filters);
    let r = await query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values);
    return Number(r.rows[0].n);
}

// Each row: the filter, and the answer entries.json gives for the same question.
const text_answers = [
    [{},                                             120],
    [{ entry_id: "tna" },                              2],
    [{ entry_id: "TNA" },                              2],
    [{ author_name: "hingerty" },                      1],
    [{ source_organism: "sacch" },                    11],
    [{ entity_name: "tRNA" },                         16],
    [{ nonstandard_residue: "PSU" },                  10],
    [{ assigned_ntc: "AA00" },                         0],
    [{ entry_id: "tna", source_organism: "sacch" },    2]
];

for (const [filters, expected] of text_answers) {
    test(`SQL filter ${JSON.stringify(filters)} matches the JSON answer`, async () => {
        assert.equal(await count(filters), expected);
    });
}

test("a filter with no value is left out of the WHERE entirely", () => {
    assert.deepEqual(build_where({}), { where: "TRUE", values: [] });
});

test("placeholders are numbered in the order the values were added", () => {
    let built = build_where({ entry_id: "tna", source_organism: "sacch" });

    assert.match(built.where, /\$1/);
    assert.match(built.where, /\$2/);
    assert.deepEqual(built.values, ["%tna%", "%sacch%"]);
});

test("a value never reaches the SQL text", () => {
    let built = build_where({ entry_id: "' OR '1'='1" });

    assert.ok(!built.where.includes("OR '1'='1"), "the value must stay a parameter");
    assert.deepEqual(built.values, ["%' OR '1'='1%"]);
});


// Pills and the score range. Same rule: every number is what the JavaScript
// version returns for the same filter.
const pill_answers = [
    [{ polymer_type: "Nucleic acid" },                            60],
    [{ polymer_type: "Protein/NA" },                              60],
    [{ polymer_type: "Nucleic acid,Protein/NA" },                120],
    [{ polymer_type: "any" },                                    120],
    [{ experimental_method: "SOLUTION NMR" },                      3],
    [{ experimental_method: "SOLUTION NMR,X-RAY DIFFRACTION" },   68],
    [{ monomer_flag: "Standard" },                                87],
    [{ monomer_flag: "Non-Standard" },                            33],
    [{ confal_min: "0" },                                          0],
    [{ confal_max: "100" },                                        0],
    [{ entry_id: "tna", monomer_flag: "Non-Standard" },            2]
];

for (const [filters, expected] of pill_answers) {
    test(`SQL filter ${JSON.stringify(filters)} matches the JSON answer`, async () => {
        assert.equal(await count(filters), expected);
    });
}

test("a whole pill list goes in as ONE parameter", () => {
    let built = build_where({ experimental_method: "SOLUTION NMR,X-RAY DIFFRACTION" });

    assert.equal(built.values.length, 1, "two pills, still one parameter");
    assert.deepEqual(built.values[0], ["SOLUTION NMR", "X-RAY DIFFRACTION"]);
    assert.match(built.where, /= ANY\(\$1\)/);
});


// --- the indexes the search depends on ----------------------------------
// Not a speed test, those are flaky. It checks the indexes exist, which is the
// real mistake: loading init.sql and forgetting the migrations.

const REQUIRED_INDEXES = [
    "idx_entry_id_upper",
    "idx_entry_id_trgm",
    "idx_citation_author_name_trgm",
    "idx_entity_description_trgm",
    "idx_src_gen_organism_trgm",
    "idx_entity_poly_entry_type",
    "idx_poly_seq_entry_mon"
];

test("every index the search relies on is present", async () => {
    let r = await query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
    let present = new Set(r.rows.map((row) => row.indexname));

    for (const name of REQUIRED_INDEXES) {
        assert.ok(present.has(name),
            `${name} is missing, run: node --env-file-if-exists=.env db/migrate.mjs`);
    }
});

// With 120 rows a sequential scan is genuinely cheaper, so this asks whether
// the index can serve the query at all. That answer does not change with size.
test("the id lookup CAN be served by an index, not only by a scan", async () => {
    // transaction(), not four separate query() calls: SET LOCAL only affects
    // the transaction it runs in, and the pool hands out a different
    // connection each call. This used to pass by luck.
    let r = await transaction(async (q) => {
        await q("SET LOCAL enable_seqscan = off");
        return q("EXPLAIN SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1)", ["4tna"]);
    });

    let plan = r.rows.map((row) => row["QUERY PLAN"]).join(" ");

    assert.match(plan, /idx_entry_id_upper/,
        `find_entry would scan every row. Plan was: ${plan}`);
});


// --- derived columns must not drift -------------------------------------
// has_nonstandard_residue is stored, not computed, which is only safe while it
// agrees with the rows behind it. A loader that forgets it would be silent.

test("the stored monomer flag still agrees with the residues", async () => {
    let r = await query(`
        SELECT count(*) AS wrong FROM entry e
        WHERE e.has_nonstandard_residue IS DISTINCT FROM EXISTS (
            SELECT 1 FROM entity_poly_seq eps
            JOIN chem_comp cc ON cc.id = eps.mon_id
            WHERE eps.entry_id = e.id AND cc.mon_nstd_flag = 'n'
        )
    `);

    assert.equal(Number(r.rows[0].wrong), 0,
        "has_nonstandard_residue has drifted, re-run db/migrations/006 to recompute");
});
