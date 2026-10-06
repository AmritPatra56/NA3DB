// server.test.js - checks the routes: status codes, formats, and what is
// deliberately not downloadable. Imports the app and runs it on a free port.

import test, { before, after } from "node:test";
import assert from "node:assert";
import { once } from "node:events";
import app from "./server.js";
import { close as close_db } from "./db.js";

let base;
let server;

// One server for the whole file. Port 0 means "any free port", so these tests
// can run while npm run dev is already using 4000.
before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    base = `http://localhost:${server.address().port}`;
});

// Both of these or the test process never exits: the HTTP server holds the
// port, and the database pool holds its connections for idleTimeoutMillis.
after(async () => {
    server.close();
    await close_db();
});


// --- pages --------------------------------------------------------------

test("the search page is served at /", async () => {
    let res = await fetch(base + "/");

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /html/);
});

test("the report page is served at /report", async () => {
    assert.equal((await fetch(base + "/report")).status, 200);
});

test("a structure page is built from our own data", async () => {
    let res = await fetch(base + "/structure/4TNA");
    let html = await res.text();

    assert.equal(res.status, 200);
    // curl runs no JavaScript, so finding this proves the server rendered it.
    assert.match(html, /FURTHER REFINEMENT/);
});

test("a structure page ignores case in the id", async () => {
    assert.equal((await fetch(base + "/structure/4tna")).status, 200);
});

test("an unknown structure is a real 404, not a 200 that says not found", async () => {
    assert.equal((await fetch(base + "/structure/ZZZZ")).status, 404);
});


// --- the API ------------------------------------------------------------

test("/api/health reports the database is reachable", async () => {
    let res = await fetch(base + "/api/health");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, database: "up" });
});

// Asserts the TYPE, not the value. 120 becomes 1,489 when the real structures
// are loaded, and that is not a reason for a test to go red.
test("/api/stats counts the entries in the database", async () => {
    let res = await fetch(base + "/api/stats");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(typeof body.total, "number");
    assert.ok(body.total > 0);
});


test("/api/entries returns a page and the counts to draw pagination", async () => {
    let body = await (await fetch(base + "/api/entries")).json();

    assert.ok(Array.isArray(body.results));
    for (const key of ["total", "page", "pages", "page_size"]) {
        assert.equal(typeof body[key], "number", `${key} should be a number`);
    }
});

test("/api/entries applies its filters", async () => {
    let body = await (await fetch(base + "/api/entries?entry_id=tna")).json();

    assert.ok(body.results.length > 0);
    for (const entry of body.results) {
        assert.ok(entry.pdb_id.toLowerCase().includes("tna"));
    }
});

test("/api/entries/:id returns that one entry", async () => {
    let body = await (await fetch(base + "/api/entries/4tna")).json();

    assert.equal(body.pdb_id, "4TNA");
});

test("an unknown id is 404 with a readable message", async () => {
    let res = await fetch(base + "/api/entries/ZZZZ");

    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /ZZZZ/);
});

test("an impossible query is 400, not 500", async () => {
    let res = await fetch(base + "/api/entries?confal_min=9&confal_max=2");

    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /cannot be higher/);
});


// --- the right format for the right caller ------------------------------

test("an unknown /api path answers in JSON", async () => {
    let res = await fetch(base + "/api/nonsense");

    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /json/);
});

test("an unknown page answers in HTML", async () => {
    let res = await fetch(base + "/nonsense");

    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /html/);
});


// --- what must never be downloadable ------------------------------------

// --- the registry endpoint ----------------------------------------------
// A promise rather than a behaviour: no SQL crosses this line. It fails the
// day a field reaches the whitelist by accident.
test("/api/fields never ships the SQL", async () => {
    let body = (await (await fetch(base + "/api/fields")).text()).toUpperCase();

    for (const word of ["SELECT", "WHERE", "EXISTS", "ILIKE", "COALESCE",
                        "STRING_AGG", "ENTITY_POLY_SEQ", "E.ID"]) {
        assert.ok(!body.includes(word), `the response must not contain ${word}`);
    }
});

test("/api/fields describes every filter and column", async () => {
    let body = await (await fetch(base + "/api/fields")).json();

    assert.equal(body.filters.length, 11);
    assert.equal(body.columns.length, 24);
    assert.deepEqual(body.text_filters.length, 8);
    assert.deepEqual(body.pill_filters.length, 3);

    // The four safe fields, and nothing else.
    assert.deepEqual(Object.keys(body.filters[0]).sort(),
                     ["group", "kind", "key", "label"].sort());
    assert.deepEqual(Object.keys(body.columns[0]).sort(),
                     ["group", "key", "label", "scope"].sort());
});

// The injected copy in the page is the one the browser actually runs on.
test("the search page carries the registry and not the SQL", async () => {
    let html = (await (await fetch(base + "/")).text());

    assert.match(html, /window\.REGISTRY = \{/);
    assert.ok(!/ILIKE|string_agg|entity_poly_seq/i.test(html),
              "the page must not contain SQL");
});

// --- the generated form -------------------------------------------------
// A filter in the registry is a control on the form. Fails if one is added
// and the form does not grow.
test("the form has a control for every filter in the registry", async () => {
    let html = await (await fetch(base + "/")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    for (const f of reg.filters) {
        if (f.kind === "pills") {
            assert.ok(html.includes(`data-name="${f.key}"`),
                      `no pill group for ${f.key}`);
            for (const o of f.options) {
                assert.ok(html.includes(`data-value="${o.value}"`),
                          `no pill for ${f.key} = ${o.value}`);
            }
        } else {
            assert.ok(html.includes(`name="${f.key}"`), `no input for ${f.key}`);
        }
    }
});

// confal_min and confal_max are two filters and ONE control. pair_with is
// what tells the template that; without it the form grows two stray boxes.
test("the form draws one range control, not two", async () => {
    let html = await (await fetch(base + "/")).text();

    assert.equal((html.match(/range_row/g) || []).length, 1);
    assert.ok(html.includes('placeholder="min"'));
    assert.ok(html.includes('placeholder="max"'));
});

// One category box per group, each with the slug that colours its dot.
test("the form draws one box per group, in registry order", async () => {
    let html = await (await fetch(base + "/")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    let seen = [...html.matchAll(/class="category ([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(seen, reg.groups.map((g) => g.slug));

    // The note belongs to 3D Features and to nothing else.
    assert.equal((html.match(/field_note/g) || []).length, 1);
});

// --- the detail rows ----------------------------------------------------
// The panel and the structure page were two hand-written lists and had
// drifted: 17 rows against 22, two ways to print a resolution. These keep them
// one list. 4TNA and 3BNA are seed.sql fixtures; the suite uses na3db_test.
test("the panel and the structure page draw the same rows", async () => {
    let api  = await (await fetch(base + "/api/entries/4TNA")).json();
    let html = await (await fetch(base + "/structure/4TNA")).text();

    assert.ok(api.rows.length > 0, "there should be rows to compare");

    for (const row of api.rows) {
        assert.ok(html.includes(`>${row.label}<`), `the page is missing ${row.label}`);
    }

    // Same count, so the page cannot carry extras either.
    assert.equal((html.match(/detail_field/g) || []).length, api.rows.length);
});

test("the raw fields survive beside the formatted rows", async () => {
    let api = await (await fetch(base + "/api/entries/4TNA")).json();

    assert.equal(typeof api.resolution, "number", "2.5, not the string 2.50 Å");
    assert.ok(api.rows.some((r) => r.value === "2.50 \u00C5"),
              "the formatted value belongs in rows, not in the field");
});

// 3BNA's resolution is exactly 3, where the page said "3 Å" and the panel
// said "3.00 Å".
test("a whole-number resolution still prints two decimals", async () => {
    let api  = await (await fetch(base + "/api/entries/3BNA")).json();
    let html = await (await fetch(base + "/structure/3BNA")).text();

    assert.ok(api.rows.some((r) => r.value === "3.00 \u00C5"));
    assert.ok(html.includes("3.00 \u00C5"), "and the page agrees");
});

test("a column marked in_detail: false is fetched but is not a row", async () => {
    let api = await (await fetch(base + "/api/entries/4TNA")).json();
    let labels = api.rows.map((r) => r.label);

    assert.ok(!labels.includes("Entry ID"), "the id is the heading, not a row");
    assert.equal(api.pdb_id, "4TNA", "but it is still fetched - the links need it");
});

// Everything in public/ is public. Everything else must not be reachable,
// or a visitor could read the server source or the raw templates.
const private_files = [
    "/server.js",
    "/search.js",
    "/search.reference.mjs",
    "/filters.js",
    "/detail.js",
    "/db.js",
    "/db/init.sql",
    "/db/seed.sql",
    "/entries.json",
    "/index.ejs",
    "/structure.ejs",
    "/views/index.ejs",
    "/package.json",
    "/.env"
];

for (const path of private_files) {
    test(`${path} is not downloadable`, async () => {
        assert.equal((await fetch(base + path)).status, 404);
    });
}

test("but public files are", async () => {
    for (const path of ["/style.css", "/app.js", "/assets/search.svg"]) {
        assert.equal((await fetch(base + path)).status, 200, path);
    }
});
